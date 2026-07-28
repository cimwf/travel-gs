# Community V1 Design QA

## Source references

- Community feed:
  `/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_8UgEfeoRYad2hIjEt4Z6cDsI.png`
- Publish screen:
  `/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_5kHfthmZTcOh63KudDDndoZR.png`

Both source images were opened at original resolution before implementation review.

## Static implementation review

- Custom navigation bars preserve the source hierarchy and reserve the WeChat
  capsule area.
- Feed uses the source white surface, blue primary action, circular avatar,
  subtle dividers, location chip, one-image hero layout and three-column image
  grid.
- Publish uses the source centered title, blue publish CTA, 300-character
  editor, three-column image grid, location row and fixed public visibility row.
- Core visible icons use local raster assets sourced from Bootstrap Icons;
  emoji, text glyph stand-ins, inline SVG and CSS-drawn icons are not used.
- Likes and comments shown in the concept image were intentionally omitted
  because Community V1 only supports display, publish, location and author
  deletion.
- Empty, loading, error, uploading, retry and reviewing states are implemented.

## Runtime visual comparison

Blocked on 2026-07-27: WeChat Developer Tools reports
`INVALID_LOGIN, access_token expired` for appid `wx5d9d6bbbc7538c04`, so the
simulator cannot start and an implementation screenshot cannot be captured.
The failure occurs before the mini-program page is rendered.

After the project owner logs in again, capture both screens on iPhone 12/13
(Pro), compare them against the source references at the same viewport, and
check spacing, type weight, image crop, borders, capsule clearance and the
three-column grid before release.
