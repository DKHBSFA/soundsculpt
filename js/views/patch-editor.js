/**
 * Patch Editor View - Visual patching canvas (PureData/Max style)
 * Allows building audio graphs by connecting nodes visually
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { history } from '../history.js';

// === Node Definitions ===

/**
 * Available node types with their configuration
 */
const NODE_TYPES = {
  // Generators
  'osc~': {
    category: 'generators',
    label: 'osc~',
    inlets: [
      { id: 'freq', type: 'control', name: 'freq', defaultValue: 440 },
    ],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: { type: 'sine' }, // sine, square, sawtooth, triangle
    webAudio: 'OscillatorNode',
  },
  'noise~': {
    category: 'generators',
    label: 'noise~',
    inlets: [],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: { type: 'white' }, // white, pink, brown
    webAudio: 'custom',
  },
  'phasor~': {
    category: 'generators',
    label: 'phasor~',
    inlets: [{ id: 'freq', type: 'control', name: 'freq', defaultValue: 1 }],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: {},
    webAudio: 'custom',
  },

  // Filters
  'lop~': {
    category: 'filters',
    label: 'lop~',
    inlets: [
      { id: 'in', type: 'audio', name: 'in' },
      { id: 'freq', type: 'control', name: 'cutoff', defaultValue: 1000 },
    ],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: {},
    webAudio: 'BiquadFilterNode',
    filterType: 'lowpass',
  },
  'hip~': {
    category: 'filters',
    label: 'hip~',
    inlets: [
      { id: 'in', type: 'audio', name: 'in' },
      { id: 'freq', type: 'control', name: 'cutoff', defaultValue: 100 },
    ],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: {},
    webAudio: 'BiquadFilterNode',
    filterType: 'highpass',
  },
  'bp~': {
    category: 'filters',
    label: 'bp~',
    inlets: [
      { id: 'in', type: 'audio', name: 'in' },
      { id: 'freq', type: 'control', name: 'center', defaultValue: 500 },
      { id: 'q', type: 'control', name: 'Q', defaultValue: 1 },
    ],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: {},
    webAudio: 'BiquadFilterNode',
    filterType: 'bandpass',
  },

  // Math
  '*~': {
    category: 'math',
    label: '*~',
    inlets: [
      { id: 'in1', type: 'audio', name: 'in1' },
      { id: 'in2', type: 'control', name: 'mult', defaultValue: 1 },
    ],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: {},
    webAudio: 'GainNode',
  },
  '+~': {
    category: 'math',
    label: '+~',
    inlets: [
      { id: 'in1', type: 'audio', name: 'in1' },
      { id: 'in2', type: 'audio', name: 'in2' },
    ],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: {},
    webAudio: 'custom',
  },

  // Envelope
  'adsr~': {
    category: 'envelope',
    label: 'adsr~',
    inlets: [
      { id: 'gate', type: 'control', name: 'gate', defaultValue: 0 },
    ],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
    webAudio: 'custom',
  },
  'line~': {
    category: 'envelope',
    label: 'line~',
    inlets: [{ id: 'target', type: 'control', name: 'target', defaultValue: 0 }],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: { time: 0.1 },
    webAudio: 'ConstantSourceNode',
  },

  // Delay
  'delay~': {
    category: 'delay',
    label: 'delay~',
    inlets: [
      { id: 'in', type: 'audio', name: 'in' },
      { id: 'time', type: 'control', name: 'time', defaultValue: 0.5 },
    ],
    outlets: [{ id: 'out', type: 'audio', name: 'out' }],
    params: { maxTime: 2 },
    webAudio: 'DelayNode',
  },

  // I/O
  'dac~': {
    category: 'io',
    label: 'dac~',
    inlets: [
      { id: 'L', type: 'audio', name: 'L' },
      { id: 'R', type: 'audio', name: 'R' },
    ],
    outlets: [],
    params: {},
    webAudio: 'destination',
  },
  'adc~': {
    category: 'io',
    label: 'adc~',
    inlets: [],
    outlets: [
      { id: 'L', type: 'audio', name: 'L' },
      { id: 'R', type: 'audio', name: 'R' },
    ],
    params: {},
    webAudio: 'MediaStreamSourceNode',
  },

  // Control
  'number': {
    category: 'control',
    label: 'number',
    inlets: [{ id: 'in', type: 'control', name: 'in' }],
    outlets: [{ id: 'out', type: 'control', name: 'out' }],
    params: { value: 0 },
    webAudio: null,
  },
  'slider': {
    category: 'control',
    label: 'slider',
    inlets: [],
    outlets: [{ id: 'out', type: 'control', name: 'out' }],
    params: { value: 0, min: 0, max: 1 },
    webAudio: null,
  },
};

/**
 * Node categories for the palette
 */
const NODE_CATEGORIES = [
  { id: 'generators', label: 'Generators', nodes: ['osc~', 'noise~', 'phasor~'] },
  { id: 'filters', label: 'Filters', nodes: ['lop~', 'hip~', 'bp~'] },
  { id: 'math', label: 'Math', nodes: ['*~', '+~'] },
  { id: 'envelope', label: 'Envelope', nodes: ['adsr~', 'line~'] },
  { id: 'delay', label: 'Delay', nodes: ['delay~'] },
  { id: 'io', label: 'I/O', nodes: ['dac~', 'adc~'] },
  { id: 'control', label: 'Control', nodes: ['number', 'slider'] },
];

// === Dimensions ===
const NODE_WIDTH = 100;
const NODE_MIN_HEIGHT = 50;
const INLET_OUTLET_SIZE = 10;
const INLET_OUTLET_SPACING = 18;
const NODE_HEADER_HEIGHT = 24;
const GRID_SIZE = 20;

/**
 * Generate unique ID
 */
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Patch Editor View class
 */
export class PatchEditorView {
  constructor(container) {
    this.container = container;
    this.nodes = [];
    this.connections = [];
    this.selectedNodes = new Set();
    this.selectedConnection = null;

    // Interaction state
    this.isDragging = false;
    this.isConnecting = false;
    this.dragStart = null;
    this.dragOffset = null;
    this.connectionStart = null;
    this.tempConnection = null;

    // Viewport
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.isPanning = false;
    this.panStart = null;

    // Current voice
    this.currentVoiceId = null;

    this.init();
  }

  /**
   * Initialize the patch editor
   */
  init() {
    this.render();
    this.setupEventListeners();
    this.setupEventBusListeners();
  }

  /**
   * Render the patch editor
   */
  render() {
    this.container.innerHTML = `
      <div class="patch-editor">
        <div class="patch-toolbar">
          <span class="patch-label">PATCH EDITOR</span>
          <div class="patch-voice-info">
            <span id="patch-voice-name">No voice selected</span>
          </div>
          <div class="patch-toolbar-actions">
            <button class="patch-btn" id="patch-zoom-in" title="Zoom In">+</button>
            <span class="patch-zoom-level">100%</span>
            <button class="patch-btn" id="patch-zoom-out" title="Zoom Out">−</button>
            <button class="patch-btn" id="patch-fit" title="Fit to view">Fit</button>
            <button class="patch-btn" id="patch-clear" title="Clear patch">Clear</button>
          </div>
        </div>

        <div class="patch-main">
          <!-- Node Palette -->
          <aside class="patch-palette">
            <div class="palette-header">Add Node</div>
            ${this.renderPalette()}
          </aside>

          <!-- Canvas -->
          <div class="patch-canvas-container" id="patch-canvas-container">
            <svg class="patch-canvas" id="patch-canvas" width="100%" height="100%">
              <defs>
                <!-- Arrow marker for connections -->
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5"
                        markerWidth="6" markerHeight="6"
                        orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-text-muted)"/>
                </marker>
              </defs>

              <!-- Grid background -->
              <defs>
                <pattern id="grid" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="0.5" fill="var(--color-glass-border)"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" class="patch-grid"/>

              <!-- Connections layer -->
              <g class="connections-layer" id="connections-layer"></g>

              <!-- Temp connection (while dragging) -->
              <path class="temp-connection" id="temp-connection" d="" style="display: none"/>

              <!-- Nodes layer -->
              <g class="nodes-layer" id="nodes-layer"></g>
            </svg>
          </div>
        </div>

        <!-- Connection info tooltip -->
        <div class="patch-tooltip hidden" id="patch-tooltip"></div>
      </div>
    `;

    // Cache DOM references
    this.svg = this.container.querySelector('#patch-canvas');
    this.nodesLayer = this.container.querySelector('#nodes-layer');
    this.connectionsLayer = this.container.querySelector('#connections-layer');
    this.tempConnectionEl = this.container.querySelector('#temp-connection');
    this.canvasContainer = this.container.querySelector('#patch-canvas-container');
    this.zoomLevelEl = this.container.querySelector('.patch-zoom-level');
    this.voiceNameEl = this.container.querySelector('#patch-voice-name');
    this.tooltip = this.container.querySelector('#patch-tooltip');
  }

  /**
   * Render the node palette
   */
  renderPalette() {
    return NODE_CATEGORIES.map(cat => `
      <div class="palette-category">
        <div class="palette-category-label">${cat.label}</div>
        <div class="palette-nodes">
          ${cat.nodes.map(nodeType => `
            <button class="palette-node" data-node-type="${nodeType}" title="${nodeType}">
              ${NODE_TYPES[nodeType].label}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  /**
   * Setup DOM event listeners
   */
  setupEventListeners() {
    // Palette node clicks
    this.container.querySelectorAll('.palette-node').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const nodeType = btn.dataset.nodeType;
        this.addNode(nodeType);
      });
    });

    // Canvas interactions
    this.canvasContainer?.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvasContainer?.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvasContainer?.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvasContainer?.addEventListener('mouseleave', this.handleMouseUp.bind(this));
    this.canvasContainer?.addEventListener('wheel', this.handleWheel.bind(this));
    this.canvasContainer?.addEventListener('dblclick', this.handleDoubleClick.bind(this));

    // Keyboard
    document.addEventListener('keydown', this.handleKeyDown.bind(this));

    // Toolbar
    this.container.querySelector('#patch-zoom-in')?.addEventListener('click', () => this.setZoom(this.zoom + 0.1));
    this.container.querySelector('#patch-zoom-out')?.addEventListener('click', () => this.setZoom(this.zoom - 0.1));
    this.container.querySelector('#patch-fit')?.addEventListener('click', () => this.fitToView());
    this.container.querySelector('#patch-clear')?.addEventListener('click', () => this.clearPatch());
  }

  /**
   * Setup event bus listeners
   */
  setupEventBusListeners() {
    eventBus.on(Events.VOICE_SELECT, (voiceId) => {
      this.loadVoicePatch(voiceId);
    });

    eventBus.on(Events.VIEW_CHANGE, (view) => {
      if (view === 'patch') {
        const selectedVoice = state.get('selectedVoiceId');
        if (selectedVoice) {
          this.loadVoicePatch(selectedVoice);
        }
      }
    });
  }

  /**
   * Load patch data for a voice
   */
  loadVoicePatch(voiceId) {
    this.currentVoiceId = voiceId;
    const voice = state.getVoice(voiceId);

    if (!voice) {
      this.voiceNameEl.textContent = 'No voice selected';
      this.nodes = [];
      this.connections = [];
      this.renderNodes();
      this.renderConnections();
      return;
    }

    this.voiceNameEl.textContent = `${voice.icon} ${voice.name}`;

    // Load patch content
    if (voice.content?.patch) {
      this.nodes = voice.content.patch.nodes || [];
      this.connections = voice.content.patch.connections || [];
    } else {
      this.nodes = [];
      this.connections = [];
    }

    this.renderNodes();
    this.renderConnections();
  }

  /**
   * Save current patch to voice
   */
  savePatch() {
    if (!this.currentVoiceId) return;

    const voice = state.getVoice(this.currentVoiceId);
    if (!voice) return;

    if (!voice.content) voice.content = {};

    voice.content.patch = {
      nodes: this.nodes,
      connections: this.connections,
    };

    state.markDirty();
  }

  /**
   * Add a new node to the patch
   */
  addNode(nodeType, x, y) {
    const typeDef = NODE_TYPES[nodeType];
    if (!typeDef) return null;

    // Default position in center of visible area
    if (x === undefined || y === undefined) {
      const rect = this.canvasContainer.getBoundingClientRect();
      x = (rect.width / 2 - this.pan.x) / this.zoom;
      y = (rect.height / 2 - this.pan.y) / this.zoom;
    }

    // Snap to grid
    x = Math.round(x / GRID_SIZE) * GRID_SIZE;
    y = Math.round(y / GRID_SIZE) * GRID_SIZE;

    const node = {
      id: generateId(),
      type: nodeType,
      x,
      y,
      params: { ...typeDef.params },
      inlets: typeDef.inlets.map(inlet => ({
        id: `${generateId()}-${inlet.id}`,
        ...inlet,
        value: inlet.defaultValue ?? 0,
      })),
      outlets: typeDef.outlets.map(outlet => ({
        id: `${generateId()}-${outlet.id}`,
        ...outlet,
      })),
    };

    this.nodes.push(node);
    this.renderNodes();
    this.savePatch();

    return node;
  }

  /**
   * Remove a node from the patch
   */
  removeNode(nodeId) {
    // Remove all connections to/from this node
    this.connections = this.connections.filter(conn => {
      return conn.from.nodeId !== nodeId && conn.to.nodeId !== nodeId;
    });

    // Remove the node
    this.nodes = this.nodes.filter(n => n.id !== nodeId);

    this.renderNodes();
    this.renderConnections();
    this.savePatch();
  }

  /**
   * Render all nodes
   */
  renderNodes() {
    this.nodesLayer.innerHTML = '';

    for (const node of this.nodes) {
      this.nodesLayer.appendChild(this.createNodeElement(node));
    }
  }

  /**
   * Create SVG element for a node
   */
  createNodeElement(node) {
    const typeDef = NODE_TYPES[node.type];
    const isSelected = this.selectedNodes.has(node.id);

    // Calculate node height based on inlets/outlets
    const maxPorts = Math.max(node.inlets.length, node.outlets.length, 1);
    const nodeHeight = NODE_HEADER_HEIGHT + maxPorts * INLET_OUTLET_SPACING + 10;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `patch-node ${isSelected ? 'selected' : ''}`);
    g.setAttribute('data-node-id', node.id);
    g.setAttribute('transform', `translate(${node.x}, ${node.y})`);

    // Node background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'node-body');
    rect.setAttribute('width', NODE_WIDTH);
    rect.setAttribute('height', nodeHeight);
    rect.setAttribute('rx', '4');
    g.appendChild(rect);

    // Node header
    const header = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    header.setAttribute('class', `node-header category-${typeDef.category}`);
    header.setAttribute('width', NODE_WIDTH);
    header.setAttribute('height', NODE_HEADER_HEIGHT);
    header.setAttribute('rx', '4');
    g.appendChild(header);

    // Header bottom cover (remove bottom radius)
    const headerCover = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    headerCover.setAttribute('class', `node-header category-${typeDef.category}`);
    headerCover.setAttribute('y', NODE_HEADER_HEIGHT - 4);
    headerCover.setAttribute('width', NODE_WIDTH);
    headerCover.setAttribute('height', 4);
    g.appendChild(headerCover);

    // Node label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('class', 'node-label');
    label.setAttribute('x', NODE_WIDTH / 2);
    label.setAttribute('y', NODE_HEADER_HEIGHT / 2 + 4);
    label.setAttribute('text-anchor', 'middle');
    label.textContent = typeDef.label;
    g.appendChild(label);

    // Inlets
    node.inlets.forEach((inlet, i) => {
      const cy = NODE_HEADER_HEIGHT + 15 + i * INLET_OUTLET_SPACING;

      // Inlet circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', `port inlet ${inlet.type}`);
      circle.setAttribute('cx', 0);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', INLET_OUTLET_SIZE / 2);
      circle.setAttribute('data-port', 'inlet');
      circle.setAttribute('data-port-id', inlet.id);
      circle.setAttribute('data-node-id', node.id);
      g.appendChild(circle);

      // Inlet label
      const inletLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      inletLabel.setAttribute('class', 'port-label');
      inletLabel.setAttribute('x', 10);
      inletLabel.setAttribute('y', cy + 3);
      inletLabel.textContent = inlet.name;
      g.appendChild(inletLabel);
    });

    // Outlets
    node.outlets.forEach((outlet, i) => {
      const cy = NODE_HEADER_HEIGHT + 15 + i * INLET_OUTLET_SPACING;

      // Outlet circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', `port outlet ${outlet.type}`);
      circle.setAttribute('cx', NODE_WIDTH);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', INLET_OUTLET_SIZE / 2);
      circle.setAttribute('data-port', 'outlet');
      circle.setAttribute('data-port-id', outlet.id);
      circle.setAttribute('data-node-id', node.id);
      g.appendChild(circle);

      // Outlet label
      const outletLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      outletLabel.setAttribute('class', 'port-label');
      outletLabel.setAttribute('x', NODE_WIDTH - 10);
      outletLabel.setAttribute('y', cy + 3);
      outletLabel.setAttribute('text-anchor', 'end');
      outletLabel.textContent = outlet.name;
      g.appendChild(outletLabel);
    });

    return g;
  }

  /**
   * Add a connection between two ports
   */
  addConnection(fromNodeId, fromPortId, toNodeId, toPortId) {
    // Validate connection
    const fromNode = this.nodes.find(n => n.id === fromNodeId);
    const toNode = this.nodes.find(n => n.id === toNodeId);
    if (!fromNode || !toNode) return null;

    const fromPort = fromNode.outlets.find(o => o.id === fromPortId);
    const toPort = toNode.inlets.find(i => i.id === toPortId);
    if (!fromPort || !toPort) return null;

    // Check if connection already exists
    const exists = this.connections.some(c =>
      c.from.nodeId === fromNodeId &&
      c.from.portId === fromPortId &&
      c.to.nodeId === toNodeId &&
      c.to.portId === toPortId
    );
    if (exists) return null;

    const connection = {
      id: generateId(),
      from: { nodeId: fromNodeId, portId: fromPortId },
      to: { nodeId: toNodeId, portId: toPortId },
    };

    this.connections.push(connection);
    this.renderConnections();
    this.savePatch();

    return connection;
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId) {
    this.connections = this.connections.filter(c => c.id !== connectionId);
    this.renderConnections();
    this.savePatch();
  }

  /**
   * Render all connections
   */
  renderConnections() {
    this.connectionsLayer.innerHTML = '';

    for (const conn of this.connections) {
      const pathEl = this.createConnectionPath(conn);
      if (pathEl) {
        this.connectionsLayer.appendChild(pathEl);
      }
    }
  }

  /**
   * Create SVG path for a connection
   */
  createConnectionPath(conn) {
    const fromNode = this.nodes.find(n => n.id === conn.from.nodeId);
    const toNode = this.nodes.find(n => n.id === conn.to.nodeId);
    if (!fromNode || !toNode) return null;

    const fromPortIndex = fromNode.outlets.findIndex(o => o.id === conn.from.portId);
    const toPortIndex = toNode.inlets.findIndex(i => i.id === conn.to.portId);
    if (fromPortIndex === -1 || toPortIndex === -1) return null;

    const fromY = NODE_HEADER_HEIGHT + 15 + fromPortIndex * INLET_OUTLET_SPACING;
    const toY = NODE_HEADER_HEIGHT + 15 + toPortIndex * INLET_OUTLET_SPACING;

    const x1 = fromNode.x + NODE_WIDTH;
    const y1 = fromNode.y + fromY;
    const x2 = toNode.x;
    const y2 = toNode.y + toY;

    const path = this.createBezierPath(x1, y1, x2, y2);

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('class', `connection ${this.selectedConnection === conn.id ? 'selected' : ''}`);
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('data-connection-id', conn.id);

    // Determine connection type (audio or control)
    const fromPort = fromNode.outlets[fromPortIndex];
    if (fromPort.type === 'audio') {
      pathEl.classList.add('audio');
    } else {
      pathEl.classList.add('control');
    }

    return pathEl;
  }

  /**
   * Create Bezier curve path string
   */
  createBezierPath(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const controlOffset = Math.min(dx * 0.5, 100);

    const cx1 = x1 + controlOffset;
    const cy1 = y1;
    const cx2 = x2 - controlOffset;
    const cy2 = y2;

    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  }

  /**
   * Get port position in SVG coordinates
   */
  getPortPosition(nodeId, portId, isOutlet) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    let portIndex;
    if (isOutlet) {
      portIndex = node.outlets.findIndex(o => o.id === portId);
    } else {
      portIndex = node.inlets.findIndex(i => i.id === portId);
    }

    if (portIndex === -1) return null;

    const y = NODE_HEADER_HEIGHT + 15 + portIndex * INLET_OUTLET_SPACING;
    const x = isOutlet ? node.x + NODE_WIDTH : node.x;

    return { x, y: node.y + y };
  }

  // === Event Handlers ===

  handleMouseDown(e) {
    const target = e.target;
    const rect = this.canvasContainer.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.pan.x) / this.zoom;
    const y = (e.clientY - rect.top - this.pan.y) / this.zoom;

    // Check if clicking on a port
    if (target.classList.contains('port')) {
      this.startConnection(target, e);
      return;
    }

    // Check if clicking on a node
    const nodeEl = target.closest('.patch-node');
    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId;
      this.startDragNode(nodeId, x, y, e.shiftKey);
      return;
    }

    // Check if clicking on a connection
    const connEl = target.closest('.connection');
    if (connEl) {
      this.selectConnection(connEl.dataset.connectionId);
      return;
    }

    // Start panning (middle button or space+drag)
    if (e.button === 1 || e.button === 0) {
      this.startPan(e);
    }

    // Clear selection on background click
    if (!e.shiftKey) {
      this.clearSelection();
    }
  }

  handleMouseMove(e) {
    const rect = this.canvasContainer.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.pan.x) / this.zoom;
    const y = (e.clientY - rect.top - this.pan.y) / this.zoom;

    if (this.isDragging && this.dragStart) {
      this.updateDragNode(x, y);
    } else if (this.isConnecting && this.connectionStart) {
      this.updateTempConnection(e.clientX - rect.left, e.clientY - rect.top);
    } else if (this.isPanning && this.panStart) {
      this.updatePan(e);
    }
  }

  handleMouseUp(e) {
    if (this.isConnecting) {
      this.endConnection(e);
    }

    this.isDragging = false;
    this.isConnecting = false;
    this.isPanning = false;
    this.dragStart = null;
    this.connectionStart = null;
    this.panStart = null;

    this.tempConnectionEl.style.display = 'none';
  }

  handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.setZoom(this.zoom + delta);
  }

  handleDoubleClick(e) {
    const nodeEl = e.target.closest('.patch-node');
    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId;
      this.editNodeParams(nodeId);
    }
  }

  handleKeyDown(e) {
    // Only handle if patch view is active
    if (state.get('currentView') !== 'patch') return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Delete selected nodes
      this.selectedNodes.forEach(nodeId => {
        this.removeNode(nodeId);
      });
      this.selectedNodes.clear();

      // Delete selected connection
      if (this.selectedConnection) {
        this.removeConnection(this.selectedConnection);
        this.selectedConnection = null;
      }
    }

    if (e.key === 'Escape') {
      this.clearSelection();
    }
  }

  // === Drag & Drop ===

  startDragNode(nodeId, x, y, addToSelection) {
    if (!addToSelection) {
      if (!this.selectedNodes.has(nodeId)) {
        this.clearSelection();
      }
    }

    this.selectedNodes.add(nodeId);
    this.renderNodes();

    this.isDragging = true;
    const node = this.nodes.find(n => n.id === nodeId);
    this.dragStart = { nodeId, x, y };
    this.dragOffset = { x: x - node.x, y: y - node.y };
  }

  updateDragNode(x, y) {
    const dx = x - this.dragStart.x;
    const dy = y - this.dragStart.y;

    // Move all selected nodes
    this.selectedNodes.forEach(nodeId => {
      const node = this.nodes.find(n => n.id === nodeId);
      if (node) {
        if (nodeId === this.dragStart.nodeId) {
          node.x = Math.round((x - this.dragOffset.x) / GRID_SIZE) * GRID_SIZE;
          node.y = Math.round((y - this.dragOffset.y) / GRID_SIZE) * GRID_SIZE;
        } else {
          // Move relative to primary node
          node.x = Math.round((node.x + dx) / GRID_SIZE) * GRID_SIZE;
          node.y = Math.round((node.y + dy) / GRID_SIZE) * GRID_SIZE;
        }
      }
    });

    // Update start position for relative movement
    this.dragStart.x = x;
    this.dragStart.y = y;

    this.renderNodes();
    this.renderConnections();
  }

  // === Connection Drawing ===

  startConnection(portEl, e) {
    this.isConnecting = true;

    const nodeId = portEl.dataset.nodeId;
    const portId = portEl.dataset.portId;
    const isOutlet = portEl.dataset.port === 'outlet';

    this.connectionStart = { nodeId, portId, isOutlet };

    // Show temp connection
    this.tempConnectionEl.style.display = 'block';

    const pos = this.getPortPosition(nodeId, portId, isOutlet);
    this.tempConnectionStartPos = pos;
  }

  updateTempConnection(mouseX, mouseY) {
    if (!this.tempConnectionStartPos) return;

    const x1 = this.tempConnectionStartPos.x * this.zoom + this.pan.x;
    const y1 = this.tempConnectionStartPos.y * this.zoom + this.pan.y;
    const x2 = mouseX;
    const y2 = mouseY;

    // Adjust for whether we started from inlet or outlet
    let path;
    if (this.connectionStart.isOutlet) {
      path = this.createBezierPath(x1, y1, x2, y2);
    } else {
      path = this.createBezierPath(x2, y2, x1, y1);
    }

    this.tempConnectionEl.setAttribute('d', path);
  }

  endConnection(e) {
    const target = e.target;

    if (!target.classList.contains('port')) {
      return;
    }

    const endNodeId = target.dataset.nodeId;
    const endPortId = target.dataset.portId;
    const endIsOutlet = target.dataset.port === 'outlet';

    // Can't connect inlet to inlet or outlet to outlet
    if (this.connectionStart.isOutlet === endIsOutlet) {
      return;
    }

    // Can't connect to same node
    if (this.connectionStart.nodeId === endNodeId) {
      return;
    }

    // Determine direction
    let fromNodeId, fromPortId, toNodeId, toPortId;
    if (this.connectionStart.isOutlet) {
      fromNodeId = this.connectionStart.nodeId;
      fromPortId = this.connectionStart.portId;
      toNodeId = endNodeId;
      toPortId = endPortId;
    } else {
      fromNodeId = endNodeId;
      fromPortId = endPortId;
      toNodeId = this.connectionStart.nodeId;
      toPortId = this.connectionStart.portId;
    }

    this.addConnection(fromNodeId, fromPortId, toNodeId, toPortId);
  }

  // === Panning & Zooming ===

  startPan(e) {
    this.isPanning = true;
    this.panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
  }

  updatePan(e) {
    this.pan.x = e.clientX - this.panStart.x;
    this.pan.y = e.clientY - this.panStart.y;
    this.updateTransform();
  }

  setZoom(zoom) {
    this.zoom = Math.max(0.25, Math.min(2, zoom));
    this.updateTransform();
    this.zoomLevelEl.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  updateTransform() {
    this.nodesLayer.setAttribute('transform', `translate(${this.pan.x}, ${this.pan.y}) scale(${this.zoom})`);
    this.connectionsLayer.setAttribute('transform', `translate(${this.pan.x}, ${this.pan.y}) scale(${this.zoom})`);
  }

  fitToView() {
    if (this.nodes.length === 0) {
      this.pan = { x: 0, y: 0 };
      this.zoom = 1;
      this.updateTransform();
      return;
    }

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_WIDTH);
      maxY = Math.max(maxY, node.y + 100);
    }

    const rect = this.canvasContainer.getBoundingClientRect();
    const padding = 50;

    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    const scaleX = rect.width / contentWidth;
    const scaleY = rect.height / contentHeight;
    this.zoom = Math.min(scaleX, scaleY, 1);

    this.pan.x = (rect.width - contentWidth * this.zoom) / 2 - minX * this.zoom + padding * this.zoom;
    this.pan.y = (rect.height - contentHeight * this.zoom) / 2 - minY * this.zoom + padding * this.zoom;

    this.updateTransform();
    this.zoomLevelEl.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  // === Selection ===

  clearSelection() {
    this.selectedNodes.clear();
    this.selectedConnection = null;
    this.renderNodes();
    this.renderConnections();
  }

  selectConnection(connectionId) {
    this.selectedConnection = connectionId;
    this.selectedNodes.clear();
    this.renderNodes();
    this.renderConnections();
  }

  // === Node Editing ===

  editNodeParams(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Show a simple prompt for now (could be replaced with modal)
    const typeDef = NODE_TYPES[node.type];

    if (node.type === 'number' || node.type === 'slider') {
      const newValue = prompt(`Enter value for ${typeDef.label}:`, node.params.value);
      if (newValue !== null) {
        node.params.value = parseFloat(newValue) || 0;
        this.savePatch();
      }
    } else if (node.inlets.length > 0) {
      // Edit first inlet value
      const inlet = node.inlets[0];
      const newValue = prompt(`Enter ${inlet.name}:`, inlet.value);
      if (newValue !== null) {
        inlet.value = parseFloat(newValue) || inlet.defaultValue;
        this.savePatch();
      }
    }
  }

  // === Clear ===

  clearPatch() {
    if (this.nodes.length === 0) return;

    if (confirm('Clear all nodes and connections?')) {
      this.nodes = [];
      this.connections = [];
      this.selectedNodes.clear();
      this.selectedConnection = null;
      this.renderNodes();
      this.renderConnections();
      this.savePatch();
    }
  }
}

/**
 * Create and return a PatchEditorView instance
 */
export function createPatchEditorView(container) {
  return new PatchEditorView(container);
}
