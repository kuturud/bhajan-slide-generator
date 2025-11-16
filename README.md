# Bhajan Slide Generator

![GitHub stars](https://img.shields.io/github/stars/kuturud/bhajan-slide-generator?style=social)
![GitHub issues](https://img.shields.io/github/issues/kuturud/bhajan-slide-generator)
![Tech Stack](https://img.shields.io/badge/tech-HTML%20%7C%20CSS%20%7C%20JavaScript-blue)

**A modern, browser-based tool for creating beautiful PowerPoint presentations of bhajans and prayers with customizable backgrounds, layouts, and themes.**

## ✨ Highlights

- **📊 Multiple Slide Layouts**: Title slide, bhajan slides, prayer slides with translations, and "Next" footer previews
- **🎨 Dynamic Backgrounds**: Cycles through 10 background images; upload custom backgrounds or set per-prayer backgrounds
- **👁️ Inline Preview**: Expand bhajans/prayers to see lyrics directly in the library
- **🔍 Smart Search**: Search by ID, name, or lyrics/text content with checkbox filters
- **💾 Workspace Persistence**: Your setlist persists across page refreshes using sessionStorage (clears when tab closes)
- **🌗 Theme Support**: Toggle between dark and light modes, or reset to system preference
- **📱 Responsive Design**: Clean, modern UI that works on various screen sizes

## 📸 Screenshots

### Title Slide Layout
![Title Slide](docs/cover-title-slide.png)
*Centered title and subtitle with custom background (images/bhajan1.png)*

### Bhajan Slide Example
![Bhajan Slide](docs/output-bhajan-slide.png)
*Left-aligned layout with name, lyrics, and "Next" footer*

### Prayer Slide Example
![Prayer Slide](docs/output-prayer-slide.png)
*Prayer with translation/meaning in italics*

## 📄 Data Format

### Bhajans (`bhajans.json`)

The bhajans library is loaded from `python/bhajans.json` (or `bhajans.json` in the root). Each bhajan has:

```json
{
  "id": 1,
  "name": "Bhajan Name",
  "lyrics": "First line\\nSecond line\\n\\nThird line (new stanza)"
}
```

**Key points**:
- `lyrics` uses `\n` for line breaks (real newlines in JSON)
- Blank lines (`\n\n`) separate stanzas/verses
- If no blank lines exist, lyrics are auto-grouped into 4-line verses
- Trailing notes in parentheses (e.g., `(Repeat 3X)`) are handled automatically

### Prayers (`prayers.json`)

The prayers library is loaded from `prayers.json`. Each prayer has:

```json
{
  "id": "lordGanesha",
  "title": "Lord Ganesha",
  "lyrics": "Prayer text in Sanskrit/original language\nWith line breaks",
  "translation": "English meaning or translation (optional)"
}
```

**Key points**:
- `translation` field is displayed in italics below the prayer text
- Empty `translation` is allowed (prayer-only slides)
- Supports multi-faith prayers (Hindu, Christian, Buddhist, Islamic, Sikh, etc.)

## 🔍 Searching

Both the Bhajan Library and Prayers Library include search functionality:

- **Bhajan Search**: By default searches ID and name. Check "Search lyrics" to also search bhajan text.
- **Prayer Search**: By default searches key and title. Check "Search text" to also search prayer lyrics.
- **Clear Button**: Quickly reset search filters

The search is case-insensitive and updates results in real-time.

## 🎨 Slide Layouts

### Title Slide
- Uses `images/bhajan1.png` as background
- Centered layout with equidistant title and subtitle from center
- Title font: 54pt, white
- Subtitle font: 32pt, yellow
- Subtitle auto-fills with current date (e.g., "9th November 2025")

### Bhajan Slide
- Left-aligned layout
- Header (bhajan name): 40pt bold, white
- Lyrics: 34pt base font, white, auto-sized to fit content
- Background: Cycles through `images/bhajan2.png` to `bhajan10.png`
- Footer: Shows "Next: [next slide title]" in small text

### Prayer Slide
- Left-aligned layout
- Header (prayer title): 54pt bold, white
- Lyrics: 40pt base font, white
- Translation/meaning: Italics, white, smaller font (minimum 20pt)
- Background: Uses same cycling as bhajans, or custom per-prayer background
- Footer: Shows "Next: [next slide title]"

### Colors & Fonts
All text uses white (`#FFFFFF`) for maximum visibility on photo backgrounds. The app uses system fonts for broad compatibility.

## 🖼️ Backgrounds

### Default Backgrounds
- **Title slide**: `images/bhajan1.png` (fixed)
- **Other slides**: Cycles through `images/bhajan2.png` to `images/bhajan10.png`

### Custom Backgrounds
- **Upload Override**: Use the "Upload background" button to set a custom image for all slides (except title)
- **Per-Prayer Background**: Add a `background` field to any prayer in `prayers.json` with a relative path (e.g., `"background": "images/custom.png"`)

Backgrounds are embedded directly into the PowerPoint file, so the generated `.pptx` is self-contained.

## 💼 Workspace

The workspace table shows your current presentation setlist:

- **Drag to Reorder**: Rows are draggable; arrange slides in any order
- **Add Items**: 
  - Use "Add" buttons in the libraries to add prayers/bhajans
  - Use "Add by ID" for quick bhajan insertion
  - Use "Add Filler Slide" for blank slides
  - Use "Add New Blank" for custom bhajan entries
- **Edit Titles**: Click on titles in the workspace to edit them inline
- **Remove Items**: Click the "Remove" button on any row
- **Persistence**: The workspace is saved to `sessionStorage` and persists across page refreshes. It clears when you close the browser tab.

### Workspace Actions
- **Show Lyrics**: Expand any item to preview its lyrics
- **Edit Fields**: Some fields (title, gender, key) are editable inline

## 🎭 Theme

The app supports dark and light themes:

- **Toggle Theme**: Click "🌗 Toggle Theme" to switch between dark and light modes
- **Reset Theme**: Click "Reset Theme" to clear your preference and use the system default
- Theme preference is saved to `localStorage` and persists across sessions

## 🗺️ Roadmap

Future enhancements under consideration:

- [x] **Pagination for Long Prayers**: Automatically split prayers longer than X lines across multiple slides
- [ ] **Multiple Slides Labelled**: Where there are multiple slides, they will be labelled as such
- [ ] **Fixed-Size Typography**: Option to lock font sizes instead of auto-scaling
- [ ] **Export/Import Setlists**: Save and load workspace configurations as JSON
- [ ] **Tags/Categories**: Filter bhajans by deity, theme, or language
- [ ] **Multi-language Support**: UI translations
- [ ] **Slide Templates**: Additional layout options and color schemes
- [ ] **Offline Support**: Service worker for offline functionality

## 🙏 Credits

Built with love for the Sai community by **Ashvik Dubey**.

### Technologies Used
- **[PptxGenJS](https://gitbrent.github.io/PptxGenJS/)**: PowerPoint generation library
- **[jQuery](https://jquery.com/)**: DOM manipulation and AJAX
- **[jQuery UI](https://jqueryui.com/)**: Drag-and-drop functionality
- **HTML/CSS/JavaScript**: Core web technologies

### Philosophy
*"Love All, Serve All"* - Sathya Sai Baba

This tool is built for everyone, to help spread devotional joy through music and prayer.

---

**Made with ❤️ for the Sai community**

*This ReadMe was generated by OpenAI's ChatGPT 5
