Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $root 'assets\images\google-play-feature-graphic.jpg'
$photoMainPath = Join-Path $root 'assets\images\1774535505571.jpg'
$photoAccentPath = Join-Path $root 'assets\images\1777127107648.jpg'
$iconPath = Join-Path $root 'assets\images\1000133096.png'

$width = 1024
$height = 500

function New-Color([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-Brush([string]$hex) {
  return New-Object System.Drawing.SolidBrush((New-Color $hex))
}

function New-PenColor([string]$hex, [float]$width = 1) {
  return New-Object System.Drawing.Pen((New-Color $hex), $width)
}

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $r * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $w - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $w - $diameter, $y + $h - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $h - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundedRect($graphics, $brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-RoundedPath $x $y $w $h $r
  $graphics.FillPath($brush, $path)
  $path.Dispose()
}

function Draw-RoundedRect($graphics, $pen, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-RoundedPath $x $y $w $h $r
  $graphics.DrawPath($pen, $path)
  $path.Dispose()
}

function Draw-Shadow($graphics, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r, [int]$alpha, [float]$offsetY) {
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, 32, 19, 26))
  Fill-RoundedRect $graphics $shadowBrush $x ($y + $offsetY) $w $h $r
  $shadowBrush.Dispose()
}

function Draw-ImageCoverRounded($graphics, $image, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $clipPath = New-RoundedPath $x $y $w $h $r
  $state = $graphics.Save()
  $graphics.SetClip($clipPath)

  $scale = [Math]::Max($w / $image.Width, $h / $image.Height)
  $drawW = $image.Width * $scale
  $drawH = $image.Height * $scale
  $drawX = $x + (($w - $drawW) / 2)
  $drawY = $y + (($h - $drawH) / 2)

  $graphics.DrawImage($image, [float]$drawX, [float]$drawY, [float]$drawW, [float]$drawH)
  $graphics.Restore($state)
  $clipPath.Dispose()
}

function Draw-CircleImage($graphics, $image, [float]$x, [float]$y, [float]$size) {
  $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
  $clip.AddEllipse($x, $y, $size, $size)
  $state = $graphics.Save()
  $graphics.SetClip($clip)

  $scale = [Math]::Max($size / $image.Width, $size / $image.Height)
  $drawW = $image.Width * $scale
  $drawH = $image.Height * $scale
  $drawX = $x + (($size - $drawW) / 2)
  $drawY = $y + (($size - $drawH) / 2)

  $graphics.DrawImage($image, [float]$drawX, [float]$drawY, [float]$drawW, [float]$drawH)
  $graphics.Restore($state)
  $clip.Dispose()
}

function Draw-TextBlock($graphics, [string]$text, $font, $brush, [float]$x, [float]$y, [float]$w, [float]$h) {
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Near
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $graphics.DrawString($text, $font, $brush, $rect, $format)
  $format.Dispose()
}

function Draw-Chip($graphics, [string]$label, [float]$x, [float]$y, [float]$w, [float]$h, [string]$fillHex, [string]$textHex) {
  $brush = New-Brush $fillHex
  Fill-RoundedRect $graphics $brush $x $y $w $h 18
  $brush.Dispose()

  $font = New-Object System.Drawing.Font('Segoe UI Semibold', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $textBrush = New-Brush $textHex
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString($label, $font, $textBrush, (New-Object System.Drawing.RectangleF($x, $y, $w, $h)), $format)
  $format.Dispose()
  $textBrush.Dispose()
  $font.Dispose()
}

$background = New-Color '#fff8fb'
$surface = New-Color '#ffffff'
$surfaceMuted = New-Color '#fff3f7'
$borderSoft = New-Color '#f7dbe5'
$primary = New-Color '#e52b50'
$text = New-Color '#20131a'
$textMuted = New-Color '#7a5968'

$bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear($background)

$backBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 238, 244))
$accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 252, 221, 231))
$highlightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 246, 249))
$graphics.FillEllipse($accentBrush, 560, -80, 420, 420)
$graphics.FillEllipse($backBrush, 650, 210, 320, 320)
$graphics.FillEllipse($highlightBrush, -120, 260, 300, 300)

$leftPanelBrush = New-Brush '#ffffff'
$leftPanelPen = New-PenColor '#f3d0dd' 1
Draw-Shadow $graphics 48 54 420 394 34 18 14
Fill-RoundedRect $graphics $leftPanelBrush 48 54 420 394 34
Draw-RoundedRect $graphics $leftPanelPen 48 54 420 394 34

$eyebrowFont = New-Object System.Drawing.Font('Segoe UI Semibold', 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$titleFont = New-Object System.Drawing.Font('Segoe UI Bold', 60, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = New-Object System.Drawing.Font('Segoe UI Semibold', 26, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$cardTitleFont = New-Object System.Drawing.Font('Segoe UI Semibold', 18, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$cardBodyFont = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

$textBrush = New-Object System.Drawing.SolidBrush($text)
$textMutedBrush = New-Object System.Drawing.SolidBrush($textMuted)
$primaryBrush = New-Object System.Drawing.SolidBrush($primary)

Draw-Chip $graphics 'PRIVATE BY DEFAULT' 78 82 170 34 '#ffe4ed' '#b21541'
Draw-TextBlock $graphics 'Epsu' $titleFont $textBrush 76 124 300 80
Draw-TextBlock $graphics 'Anonymous local communities' $subtitleFont $textBrush 78 208 330 40
Draw-TextBlock $graphics 'for schools & regions' $subtitleFont $primaryBrush 78 242 300 38
Draw-TextBlock $graphics 'Secure and honest local posting with soft, card-based community spaces.' $bodyFont $textMutedBrush 78 304 320 78

Draw-Chip $graphics 'honest posting' 78 390 118 34 '#fff3f7' '#7a5968'
Draw-Chip $graphics 'guest mode' 206 390 96 34 '#fff3f7' '#7a5968'
Draw-Chip $graphics 'privacy-minded' 312 390 122 34 '#fff3f7' '#7a5968'

$mainPhoto = $null
$accentPhoto = $null
$iconImage = $null
if (Test-Path $photoMainPath) { $mainPhoto = [System.Drawing.Image]::FromFile($photoMainPath) }
if (Test-Path $photoAccentPath) { $accentPhoto = [System.Drawing.Image]::FromFile($photoAccentPath) }
if (Test-Path $iconPath) { $iconImage = [System.Drawing.Image]::FromFile($iconPath) }

Draw-Shadow $graphics 542 62 414 250 38 24 18
Fill-RoundedRect $graphics (New-Brush '#ffffff') 542 62 414 250 38
if ($mainPhoto) {
  Draw-ImageCoverRounded $graphics $mainPhoto 542 62 414 250 38
}
$overlayBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(92, 32, 19, 26))
Fill-RoundedRect $graphics $overlayBrush 542 62 414 250 38
Draw-Chip $graphics 'LOCAL FEED' 574 88 98 30 '#ffffff' '#20131a'
Draw-TextBlock $graphics 'Your nearby communities, styled like the app itself.' $subtitleFont $leftPanelBrush 574 198 290 72

Draw-Shadow $graphics 616 290 244 118 28 20 14
Fill-RoundedRect $graphics (New-Brush '#ffffff') 616 290 244 118 28
Draw-TextBlock $graphics 'Estonia Epsu' $cardTitleFont $textBrush 640 316 140 24
Draw-TextBlock $graphics 'Country feed' $cardBodyFont $textMutedBrush 640 342 100 18
Draw-Chip $graphics '12 online' 745 314 88 28 '#ffe4ed' '#b21541'
Draw-TextBlock $graphics 'Browse openly, then join for real posting.' $cardBodyFont $textMutedBrush 640 370 172 34

Draw-Shadow $graphics 772 256 176 176 28 18 12
Fill-RoundedRect $graphics (New-Brush '#fff3f7') 772 256 176 176 28
if ($accentPhoto) {
  Draw-CircleImage $graphics $accentPhoto 808 276 104
  $ringPen = New-PenColor '#ffffff' 6
  $graphics.DrawEllipse($ringPen, 808, 276, 104, 104)
  $ringPen.Dispose()
} elseif ($iconImage) {
  Draw-ImageCoverRounded $graphics $iconImage 812 280 96 96 24
}
Draw-Chip $graphics 'soft cards' 805 392 112 28 '#ffffff' '#7a5968'

Draw-Shadow $graphics 504 340 136 86 24 16 10
Fill-RoundedRect $graphics (New-Brush '#ffffff') 504 340 136 86 24
if ($iconImage) {
  Draw-ImageCoverRounded $graphics $iconImage 522 358 50 50 14
}
Draw-TextBlock $graphics '1 min' $cardTitleFont $textBrush 582 358 46 22
Draw-TextBlock $graphics 'guest' $cardBodyFont $textMutedBrush 582 382 42 18

[System.IO.Directory]::CreateDirectory((Split-Path -Parent $outputPath)) | Out-Null
$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)

if ($mainPhoto) { $mainPhoto.Dispose() }
if ($accentPhoto) { $accentPhoto.Dispose() }
if ($iconImage) { $iconImage.Dispose() }

$eyebrowFont.Dispose()
$titleFont.Dispose()
$subtitleFont.Dispose()
$bodyFont.Dispose()
$cardTitleFont.Dispose()
$cardBodyFont.Dispose()
$textBrush.Dispose()
$textMutedBrush.Dispose()
$primaryBrush.Dispose()
$leftPanelBrush.Dispose()
$leftPanelPen.Dispose()
$backBrush.Dispose()
$accentBrush.Dispose()
$highlightBrush.Dispose()
$overlayBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $outputPath
