// Package labels renders printable QR package labels as self-contained HTML.
package labels

import (
	"encoding/base64"
	"fmt"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

// LabelData is everything printed on one package label.
type LabelData struct {
	OrderCode    string
	CustomerName string
	Items        []ItemLine
	AddressLine  string
	Landmark     string
	LocalityName string
	Instructions string
	DeliveryDate string
	RunLabel     string // e.g. "Run 3 · Stop 5" (blank before assignment)
	PackageToken string
	Phone        string
}

// ItemLine is one product row on the label.
type ItemLine struct {
	Name     string
	Size     string
	Quantity int32
}

// QRDataURI renders the package token as a QR PNG data URI.
func QRDataURI(token string) (string, error) {
	png, err := qrcode.Encode(token, qrcode.Medium, 256)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), nil
}

// HTML renders one or more labels into a single print-ready document. One
// label per printed page via CSS page breaks.
func HTML(labels []LabelData) (string, error) {
	var sb strings.Builder
	sb.WriteString(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Aarogya Ruchi — Package Labels</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; }
  .label {
    width: 96mm; height: 140mm; padding: 5mm; margin: 5mm auto;
    border: 1.5px solid #111; page-break-after: always;
    display: flex; flex-direction: column; gap: 2.5mm;
  }
  .brand { font-size: 13pt; font-weight: 800; letter-spacing: 0.5px; color: #15803D; }
  .code { font-size: 17pt; font-weight: 800; }
  .run  { font-size: 11pt; font-weight: 600; background: #f0fdf4; border: 1px solid #15803D; border-radius: 3px; padding: 1mm 2mm; align-self: flex-start; }
  .qr   { text-align: center; }
  .qr img { width: 30mm; height: 30mm; }
  .name { font-size: 13pt; font-weight: 700; }
  .addr { font-size: 10.5pt; line-height: 1.35; }
  .meta { font-size: 9.5pt; color: #333; }
  .items { border-top: 1px dashed #666; border-bottom: 1px dashed #666; padding: 2mm 0; }
  .items table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  .items td { padding: 0.6mm 0; }
  .items td.qty { text-align: right; font-weight: 700; white-space: nowrap; }
  .footer { margin-top: auto; font-size: 9pt; color: #555; display: flex; justify-content: space-between; }
  @media print { body { margin: 0; } .label { margin: 0 auto; } }
</style>
</head>
<body>
`)

	for _, l := range labels {
		qr, err := QRDataURI(l.PackageToken)
		if err != nil {
			return "", fmt.Errorf("qr for %s: %w", l.OrderCode, err)
		}

		sb.WriteString(`<div class="label">`)
		sb.WriteString(`<div class="brand">AAROGYA RUCHI</div>`)
		sb.WriteString(`<div class="code">` + escape(l.OrderCode) + `</div>`)
		if l.RunLabel != "" {
			sb.WriteString(`<div class="run">` + escape(l.RunLabel) + `</div>`)
		}
		sb.WriteString(`<div class="qr"><img alt="QR ` + escape(l.OrderCode) + `" src="` + qr + `"></div>`)
		sb.WriteString(`<div class="name">` + escape(l.CustomerName) + `</div>`)
		sb.WriteString(`<div class="addr">` + escape(l.AddressLine))
		if l.Landmark != "" {
			sb.WriteString(`<br>Landmark: ` + escape(l.Landmark))
		}
		if l.LocalityName != "" {
			sb.WriteString(`<br>` + escape(l.LocalityName))
		}
		if l.Instructions != "" {
			sb.WriteString(`<br><i>` + escape(l.Instructions) + `</i>`)
		}
		sb.WriteString(`</div>`)
		sb.WriteString(`<div class="items"><table>`)
		for _, it := range l.Items {
			size := it.Size
			if size != "" {
				size = " (" + size + ")"
			}
			sb.WriteString(`<tr><td>` + escape(it.Name) + escape(size) + `</td><td class="qty">× ` + fmt.Sprintf("%d", it.Quantity) + `</td></tr>`)
		}
		sb.WriteString(`</table></div>`)
		sb.WriteString(`<div class="meta">Deliver: ` + escape(l.DeliveryDate) + ` (6–10 AM) · COD</div>`)
		sb.WriteString(`<div class="footer"><span>` + escape(l.Phone) + `</span><span>` + escape(l.OrderCode) + `</span></div>`)
		sb.WriteString(`</div>`)
	}

	sb.WriteString(`</body></html>`)
	return sb.String(), nil
}

func escape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&#34;", "'", "&#39;")
	return r.Replace(s)
}
