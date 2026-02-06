# SoundSculpt

A browser-based Digital Audio Workstation (DAW) for programmatic audio composition. No installation required — runs entirely in your browser using the Web Audio API.

## Features

### Multiple Editing Views
- **Sequencer** — Step-based drum machine grid
- **Piano Roll** — MIDI-style note editing
- **Score** — Traditional music notation (VexFlow)
- **Patch Editor** — Visual patching (PureData/Max style)
- **Code Editor** — Strudel pattern-based synthesis

### Music Creation
- Built-in drum synth and melodic voices
- Style-based music generation (20 styles, 6 templates)
- Scale system with quantization
- Chord palette with arpeggiator and voice leading
- Sample loading with waveform display

### Recording & Hardware
- Microphone recording with punch-in/out
- WebMIDI input support
- MIDI learn for parameter mapping
- Session recording with automation

### Audio Analysis
- BPM detection
- Pitch detection (YIN algorithm)
- Onset detection for auto-slicing
- Real-time spectrum analyzer and spectrogram

### Accessibility
- Full keyboard navigation
- ARIA labels throughout
- High contrast mode
- Colorblind-safe palette
- Reduced motion support
- Internationalization (EN, DE, ES, FR, JA)

## Quick Start

1. Open `index.html` in a modern browser
2. Click "Generate Music" to create with AI-assisted presets, or "Start from Scratch" for a blank project
3. Use the transport controls to play/pause/stop
4. Switch between views using the tab bar

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `Enter` | Stop |
| `Z` | Undo |
| `Shift+Z` | Redo |
| `S` | Save project |
| `L` | Load project |
| `N` | New voice |
| `1-5` | Switch views |

## Project Files

Projects are saved as `.soundsculpt` JSON files. Drag and drop to load, or use the Load button.

## Browser Support

Requires a modern browser with Web Audio API support:
- Chrome/Edge 66+
- Firefox 76+
- Safari 14.1+

## Tech Stack

- Vanilla JavaScript (no build step)
- Web Audio API
- VexFlow for music notation
- CodeMirror 6 for code editing
- WaveSurfer.js for waveform display

## Built With

This project was created entirely with [Claude Code](https://claude.ai/claude-code) using the [Claude Skills Framework](https://dkhbsfa.github.io/CLAUDE_SKILLS/).

## License

MIT
