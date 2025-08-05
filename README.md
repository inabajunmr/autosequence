# HTTP Request Sequence Recorder

A Chrome extension that records HTTP requests and generates Mermaid sequence diagrams.

## Features

- Start/stop HTTP request recording with button click
- Group same domains as the same participant
- Automatic generation of Mermaid sequence diagrams
- SVG export functionality
- Copy Mermaid code to clipboard

## Build

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Installation

1. Complete the build steps above
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked extension"
5. Select this folder

## Usage

1. Click the extension icon to open the popup
2. Click "Start" button to begin recording HTTP requests
3. Browse websites normally in the browser
4. Click "Stop" button to end recording
5. Click "View Diagram" to display the Mermaid sequence diagram

## File Structure

- `manifest.json` - Extension configuration
- `popup.html/js` - Popup UI
- `background.js` - Background script (HTTP request monitoring)
- `diagram.html` - Sequence diagram display page

## Notes

- Only works on HTTPS sites
- Large numbers of requests may impact performance
- Diagrams display up to 50 requests maximum