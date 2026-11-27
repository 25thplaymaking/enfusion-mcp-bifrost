# wb-anim-preview.ps1 - drive and capture the Workbench Animation Editor preview without taking focus.
#
# Called by the wb_anim_preview MCP tool (windowsHide, bounded timeout). Finds the Workbench process that owns the
# NET API port, reads the Animation Editor through UI Automation (Qt exposes names, automation ids and values),
# writes through UI Automation values or posted window messages, and captures with PrintWindow. Nothing here
# activates a window, moves the real cursor or sends global input, so the user keeps their keyboard and mouse.
#
# Steps run in order: clip -> pause/play -> frame -> view -> zoom -> cube -> capture. One JSON object is written to
# stdout. Exit code 0 on success, 2 when the editor or an element is missing, 3 on a failed readback.
# Known limit: posted mouse drags do not orbit or pan this viewport (the engine camera reads the real mouse), so
# camera angles come from the View menu presets, the navigation cube and wheel zoom (toward the view centre).
# For a bigger preview, hide the docks under it first: wb_editor_module executeAction animationEditor "Window,Graph"
# (and "Window,Channel Curves", "Window,Log Console"); the viewport is found under the View/Shading row either way.
param(
	[int]$Port = 5775,
	[string]$Clip = '',          # animation row name in the Animation Sets tree (exact, case-sensitive)
	[string]$Column = '',        # column header for that row; default = the first column
	[int]$Frame = -1,            # frame to show (pauses playback first)
	[string]$Playback = '',      # play | pause
	[string]$View = '',          # Perspective | Top | Bottom | Front | Back | Right | Left
	[int]$Zoom = 0,              # mouse-wheel ticks on the viewport, + = closer
	[int]$CubeX = -1, [int]$CubeY = -1,      # viewport pixel on the navigation cube to click (snaps the view)
	[string]$Out = '',           # PNG path to write
	[ValidateSet('viewport', 'editor')] [string]$Target = 'viewport'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
if (-not ('EmcpWin' -as [type])) {
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class EmcpWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint f);
  public static List<IntPtr> Top(uint pid) { var l = new List<IntPtr>(); EnumWindows((h, x) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static List<IntPtr> Kids(IntPtr w) { var l = new List<IntPtr>(); EnumChildWindows(w, (h, x) => { if (IsWindowVisible(h)) l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static string Text(IntPtr h) { var t = new StringBuilder(512); GetWindowText(h, t, 512); return t.ToString(); }
  public static string Cls(IntPtr h) { var t = new StringBuilder(256); GetClassName(h, t, 256); return t.ToString(); }
}
"@
}
$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$result = [ordered]@{ ok = $false; steps = @() }
function Done([int]$code, [string]$err) { if ($err) { $result.error = $err }; $result.ok = ($code -eq 0); $result | ConvertTo-Json -Depth 5 -Compress; exit $code }
function Step([string]$s) { $result.steps += $s }

# --- locate Workbench and the editor -------------------------------------------------------------------------
$conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) { Done 2 "nothing listens on port $Port (Workbench NET API down)" }
$procId = [uint32]$conn.OwningProcess
$result.workbenchPid = $procId
$ae = [EmcpWin]::Top($procId) | Where-Object { [EmcpWin]::Text($_).StartsWith('Animation Editor') } | Select-Object -First 1
if (-not $ae) { Done 2 'the Animation Editor window is not open (open a workspace .aw first)' }
$result.title = [EmcpWin]::Text($ae)
$root = $A::FromHandle($ae)

function Rect($h) { $r = New-Object EmcpWin+RECT; [void][EmcpWin]::GetWindowRect($h, [ref]$r); $r }
function LParam([int]$x, [int]$y) { [IntPtr](($y -shl 16) -bor ($x -band 0xFFFF)) }
function ById([string]$id) { $root.FindAll($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, $id))) }
# smallest visible native window (editor or child) containing a screen point, plus the point in its client space
function HostAt([int]$sx, [int]$sy) {
	$best = $ae; $area = [long]::MaxValue
	foreach ($k in [EmcpWin]::Kids($ae)) { $r = Rect $k
		if ($sx -ge $r.L -and $sx -lt $r.R -and $sy -ge $r.T -and $sy -lt $r.B) { $a = [long]($r.R - $r.L) * ($r.B - $r.T); if ($a -lt $area) { $area = $a; $best = $k } } }
	$p = New-Object EmcpWin+POINT; $p.X = $sx; $p.Y = $sy; [void][EmcpWin]::ScreenToClient($best, [ref]$p)
	@{ h = $best; x = $p.X; y = $p.Y } }
function ClickHost($t, [switch]$Double) {
	[void][EmcpWin]::PostMessage($t.h, 0x0200, [IntPtr]0, (LParam $t.x $t.y))
	[void][EmcpWin]::PostMessage($t.h, 0x0201, [IntPtr]1, (LParam $t.x $t.y)); Start-Sleep -Milliseconds 30
	[void][EmcpWin]::PostMessage($t.h, 0x0202, [IntPtr]0, (LParam $t.x $t.y))
	if ($Double) { Start-Sleep -Milliseconds 30; [void][EmcpWin]::PostMessage($t.h, 0x0203, [IntPtr]1, (LParam $t.x $t.y)); [void][EmcpWin]::PostMessage($t.h, 0x0202, [IntPtr]0, (LParam $t.x $t.y)) }
	Start-Sleep -Milliseconds 120 }
function ClickElement($e, [switch]$Double) { $b = $e.Current.BoundingRectangle; ClickHost (HostAt ([int]($b.X + $b.Width / 2)) ([int]($b.Y + $b.Height / 2))) -Double:$Double }

# timeline: the preview's push buttons in screen order are first, back, play (toggle), forward, last; the first
# line edit is the current frame, the second the frame count
function Timeline {
	$btn = @(ById 'Arma4WorkbenchApp.AnimEditor.Preview.QWidget.QPushButton' | Sort-Object { $_.Current.BoundingRectangle.X })
	$edit = @(ById 'Arma4WorkbenchApp.AnimEditor.Preview.QWidget.QLineEdit' | Sort-Object { $_.Current.BoundingRectangle.X })
	@{ btn = $btn; frame = $edit[0]; count = $edit[1] } }
function Val($e) { $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value }
function Playing($tl) { $tl.btn[2].GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState -eq 'On' }
function Viewport {
	# the 3D view is the largest native child whose top edge sits right under the preview's View/Shading row
	$vb = $root.FindFirst($Scope::Descendants, (New-Object System.Windows.Automation.AndCondition(
		(New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'View')),
		(New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'Arma4WorkbenchApp.AnimEditor.Preview.QWidget.splitter.previewWidget.QToolBar.QToolButton')))))
	if (-not $vb) { return $null }
	$row = $vb.Current.BoundingRectangle
	$top = $row.Y + $row.Height
	$cand = foreach ($k in [EmcpWin]::Kids($ae)) { $r = Rect $k
		if ($r.T -ge ($top - 2) -and $r.T -le ($top + 12) -and $r.L -le ($row.X + 4) -and ($r.B - $r.T) -gt 100) {
			[pscustomobject]@{ h = $k; a = [long]($r.R - $r.L) * ($r.B - $r.T) } } }
	($cand | Sort-Object a -Descending | Select-Object -First 1).h }

# --- clip: preview one animation alone (double-click its cell in the Animation Sets tree) --------------------
if ($Clip) {
	$tab = $root.FindFirst($Scope::Descendants, (New-Object System.Windows.Automation.AndCondition(
		(New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'Animation Sets')),
		(New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)))))
	if ($tab) { ClickElement $tab; Step 'animation sets tab' }
	$items = @(ById 'Arma4WorkbenchApp.AnimEditor.Animation Sets.QWidget.AnimEditorAnimSetTreeWidget' | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::TreeItem })
	$row = $items | Where-Object { $_.Current.Name -ceq $Clip } | Select-Object -First 1
	if (-not $row) { $result.clips = @($items | ForEach-Object { $_.Current.Name } | Where-Object { $_ }); Done 2 "no animation row named '$Clip'" }
	$ry = $row.Current.BoundingRectangle.Y; $rx = $row.Current.BoundingRectangle.X + $row.Current.BoundingRectangle.Width
	$cells = @($items | Where-Object { [Math]::Abs($_.Current.BoundingRectangle.Y - $ry) -lt 2 -and $_.Current.BoundingRectangle.X -ge ($rx - 1) } | Sort-Object { $_.Current.BoundingRectangle.X })
	if ($Column) {
		$hdr = $items | Where-Object { $_.Current.Name -ceq $Column } | Select-Object -First 1
		if (-not $hdr) { Done 2 "no column named '$Column'" }
		$cells = @($cells | Where-Object { [Math]::Abs($_.Current.BoundingRectangle.X - $hdr.Current.BoundingRectangle.X) -lt 2 })
	}
	if ($cells.Count -eq 0) { Done 2 "no animation cell next to row '$Clip'" }
	$tl = Timeline
	if (Playing $tl) { ClickElement $tl.btn[2] }   # a running graph or clip; the clip preview starts from a stop
	ClickElement $cells[0] -Double
	Start-Sleep -Milliseconds 400
	$tl = Timeline
	$result.frameCount = [int](Val $tl.count)
	Step "clip $Clip ($($result.frameCount) frames)"
}

# --- playback and frame ------------------------------------------------------------------------------------
$tl = Timeline
if ($tl.btn.Count -lt 5 -or -not $tl.frame) { Done 2 'timeline controls not found' }
if ($Playback -eq 'play' -and -not (Playing $tl)) { ClickElement $tl.btn[2]; Step 'play' }
if (($Playback -eq 'pause' -or $Frame -ge 0) -and (Playing $tl)) { ClickElement $tl.btn[2]; Start-Sleep -Milliseconds 150; Step 'pause' }
if ($Frame -ge 0) {
	$count = [int](Val $tl.count)
	if ($count -gt 0 -and $Frame -ge $count) { Done 2 "frame $Frame is past the last frame ($($count - 1))" }
	$tl.frame.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue("$Frame")
	Start-Sleep -Milliseconds 250
	$now = [int](Val $tl.frame)
	$result.frame = $now
	if ($now -ne $Frame) { Done 3 "frame readback $now, wanted $Frame" }
	Step "frame $Frame"
}
$result.frame = [int](Val $tl.frame); $result.frameCount = [int](Val $tl.count); $result.playing = (Playing $tl)

# --- camera ----------------------------------------------------------------------------------------------------
$vp = Viewport
if (-not $vp) { Done 2 'preview viewport not found' }
$vr = Rect $vp; $center = @{ h = $vp; x = [int](($vr.R - $vr.L) / 2); y = [int](($vr.B - $vr.T) / 2) }
if ($View) {
	$vb = $root.FindFirst($Scope::Descendants, (New-Object System.Windows.Automation.AndCondition(
		(New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'View')),
		(New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'Arma4WorkbenchApp.AnimEditor.Preview.QWidget.splitter.previewWidget.QToolBar.QToolButton')))))
	if (-not $vb) { Done 2 'View button not found' }
	ClickElement $vb
	$menu = $null
	for ($i = 0; $i -lt 20 -and -not $menu; $i++) { Start-Sleep -Milliseconds 100
		$menu = [EmcpWin]::Top($procId) | Where-Object { [EmcpWin]::Cls($_) -like '*Popup*' } | Select-Object -First 1 }
	if (-not $menu) { Done 2 'View menu did not open' }
	# Posted mouse clicks do not trigger a QMenu action, but posted arrow keys and Return do: the first Down
	# highlights the first item.
	$names = @($A::FromHandle($menu).FindAll($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::MenuItem))) |
		Sort-Object { $_.Current.BoundingRectangle.Y } | ForEach-Object { $_.Current.Name })
	$idx = [Array]::IndexOf($names, $View)
	if ($idx -lt 0) { [void][EmcpWin]::PostMessage($menu, 0x0100, [IntPtr]0x1B, [IntPtr]1); $result.views = $names; Done 2 "View menu has no item '$View'" }
	for ($i = 0; $i -le $idx; $i++) { [void][EmcpWin]::PostMessage($menu, 0x0100, [IntPtr]0x28, [IntPtr]1); [void][EmcpWin]::PostMessage($menu, 0x0101, [IntPtr]0x28, [IntPtr]0xC0000001); Start-Sleep -Milliseconds 50 }
	[void][EmcpWin]::PostMessage($menu, 0x0100, [IntPtr]0x0D, [IntPtr]1); [void][EmcpWin]::PostMessage($menu, 0x0101, [IntPtr]0x0D, [IntPtr]0xC0000001)
	Start-Sleep -Milliseconds 300
	Step "view $View"
}
if ($Zoom -ne 0) {
	# the engine zooms toward the view centre (it reads the real cursor, not the posted one)
	$sr = Rect $vp
	for ($i = 0; $i -lt [Math]::Abs($Zoom); $i++) {
		[void][EmcpWin]::PostMessage($vp, 0x020A, [IntPtr](([Math]::Sign($Zoom) * 120) -shl 16), (LParam ($sr.L + $center.x) ($sr.T + $center.y))); Start-Sleep -Milliseconds 60 }
	Step "zoom $Zoom"
}
if ($CubeX -ge 0 -and $CubeY -ge 0) {
	# a click on the navigation cube's face or edge snaps the camera to that side
	ClickHost @{ h = $vp; x = $CubeX; y = $CubeY }; Start-Sleep -Milliseconds 300; Step "cube $CubeX,$CubeY"
}

# --- capture ---------------------------------------------------------------------------------------------------
if ($Out) {
	Start-Sleep -Milliseconds 250   # one more rendered frame after the last change
	$h = $vp; if ($Target -eq 'editor') { $h = $ae }
	$r = Rect $h; $w = $r.R - $r.L; $ht = $r.B - $r.T
	$bmp = New-Object System.Drawing.Bitmap $w, $ht
	$g = [System.Drawing.Graphics]::FromImage($bmp); $hdc = $g.GetHdc()
	$okp = [EmcpWin]::PrintWindow($h, $hdc, 2); $g.ReleaseHdc($hdc); $g.Dispose()
	$dir = Split-Path -Parent $Out; if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
	$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
	if (-not $okp) { Done 3 'PrintWindow failed' }
	$result.out = $Out; $result.size = "${w}x$ht"
	Step "capture $Target"
}
Done 0 ''
