/**
 * app.js - Claw Display Dashboard Frontend
 * ==========================================
 *
 * Plain vanilla JS. No frameworks. Connects to the daemon's REST API
 * and WebSocket for live updates.
 *
 * Sections:
 *   1. WebSocket connection and event handling
 *   2. Status display
 *   3. Animation browser
 *   4. Flash firmware
 *   5. Upload animation
 *   6. Settings
 *   7. Logs
 *   8. Utility functions
 */

// ============================================================================
// 1. WebSocket Connection
// ============================================================================

let ws = null;
let wsRetryTimeout = null;

function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onopen = () => {
        console.log('[ws] Connected');
        if (wsRetryTimeout) {
            clearTimeout(wsRetryTimeout);
            wsRetryTimeout = null;
        }
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
    };

    ws.onclose = () => {
        console.log('[ws] Disconnected, retrying in 3s...');
        wsRetryTimeout = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
        // onclose will fire after this, triggering reconnect
    };
}

function handleWsMessage(msg) {
    switch (msg.type) {
        case 'snapshot':
            updateStatus(msg.data);
            break;
        case 'state_change':
            updateState(msg.data.state);
            break;
        case 'connection_change':
            updateConnection(msg.data);
            break;
        case 'log':
            appendLog(msg.data);
            break;
        case 'flash_progress':
            updateFlashProgress(msg.data);
            break;
        case 'upload_progress':
            updateUploadProgress(msg.data);
            break;
    }
}

// ============================================================================
// 2. Status Display
// ============================================================================

function updateStatus(data) {
    updateConnection({ connected: data.connected, port: data.port });
    updateState(data.state);
    document.getElementById('device-animation').textContent = data.animation || '--';
    updateUptime(data.uptime);
}

function updateConnection(data) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const port = document.getElementById('device-port');

    dot.className = `dot ${data.connected ? 'connected' : 'disconnected'}`;
    text.textContent = data.connected ? 'Connected' : 'Disconnected';
    port.textContent = data.port || '--';
}

function updateState(state) {
    const el = document.getElementById('device-state');
    el.textContent = state;
    el.className = `value ${state.toLowerCase()}`;
}

function updateUptime(ms) {
    if (!ms) return;
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const display = hr > 0
        ? `${hr}h ${min % 60}m`
        : min > 0
            ? `${min}m ${sec % 60}s`
            : `${sec}s`;
    document.getElementById('device-uptime').textContent = display;
}

// Refresh uptime every 10 seconds
setInterval(async () => {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        updateUptime(data.uptime);
    } catch (e) { /* ignore */ }
}, 10000);

// ============================================================================
// 3. Animation Browser
// ============================================================================

let currentAnimation = null;

async function loadAnimations() {
    try {
        const res = await fetch('/api/animations');
        const animations = await res.json();
        renderAnimations(animations);
    } catch (e) {
        console.error('Failed to load animations:', e);
    }
}

function renderAnimations(animations) {
    const grid = document.getElementById('animation-grid');
    grid.innerHTML = '';

    for (const anim of animations) {
        const card = document.createElement('div');
        card.className = `animation-card${anim.name === currentAnimation ? ' selected' : ''}`;
        card.onclick = () => selectAnimation(anim.name);

        const img = document.createElement('img');
        img.src = anim.hasPreview ? `/api/animations/${anim.name}/preview` : '';
        img.alt = anim.name;
        img.onerror = () => { img.style.display = 'none'; };

        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = anim.name;

        const count = document.createElement('div');
        count.className = 'frame-count';
        count.textContent = `${anim.frameCount} frames`;

        const flashBtn = document.createElement('button');
        flashBtn.className = 'btn-flash-anim';
        flashBtn.textContent = '⚡ Flash';
        flashBtn.title = `Build & flash firmware with ${anim.name}`;
        flashBtn.onclick = (e) => {
            e.stopPropagation(); // Don't trigger selectAnimation
            startFlash(anim.name);
        };

        card.appendChild(img);
        card.appendChild(name);
        card.appendChild(count);
        card.appendChild(flashBtn);
        grid.appendChild(card);
    }
}

async function selectAnimation(name) {
    try {
        const res = await fetch('/api/animations/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        const result = await res.json();
        if (result.ok) {
            currentAnimation = name;
            document.getElementById('device-animation').textContent = name;
            loadAnimations(); // Re-render to update selection highlight
        }
    } catch (e) {
        console.error('Failed to select animation:', e);
    }
}

// ============================================================================
// 4. Flash Firmware
// ============================================================================

document.getElementById('btn-flash').addEventListener('click', () => startFlash(null));

async function startFlash(animationName) {
    const label = animationName ? `Flash ${animationName} to device?` : 'Flash firmware to the device?';
    if (!confirm(`${label} The display will briefly disconnect.`)) return;

    const prefix = animationName ? `Preparing ${animationName}...\n` : 'Starting flash...\n';
    document.getElementById('flash-output').textContent = prefix;
    showModal('flash-modal');
    document.getElementById('btn-flash').disabled = true;

    try {
        const body = animationName ? JSON.stringify({ animation: animationName }) : undefined;
        const res = await fetch('/api/flash', {
            method: 'POST',
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body,
        });
        const data = await res.json();
        if (data.error) {
            document.getElementById('flash-output').textContent += `Error: ${data.error}\n`;
        }
        // Progress updates come via WebSocket
    } catch (e) {
        document.getElementById('flash-output').textContent += `Error: ${e.message}\n`;
    }
}

function updateFlashProgress(data) {
    const output = document.getElementById('flash-output');
    if (data.output) {
        output.textContent += data.output;
        output.scrollTop = output.scrollHeight;
    }
    if (data.status === 'done' || data.status === 'error') {
        document.getElementById('btn-flash').disabled = false;
    }
}

// ============================================================================
// 5. Upload Animation
// ============================================================================

document.getElementById('btn-upload').addEventListener('click', () => {
    document.getElementById('upload-form').classList.remove('hidden');
    document.getElementById('upload-progress').classList.add('hidden');
    showModal('upload-modal');
});

document.getElementById('btn-upload-start').addEventListener('click', async () => {
    const name = document.getElementById('upload-name').value.trim();
    const file = document.getElementById('upload-file').files[0];

    if (!name || !file) {
        alert('Please provide a name and select a file.');
        return;
    }

    if (!/^[a-z0-9_]+$/.test(name)) {
        alert('Name must be lowercase letters, numbers, and underscores only.');
        return;
    }

    document.getElementById('upload-form').classList.add('hidden');
    document.getElementById('upload-progress').classList.remove('hidden');
    document.getElementById('upload-output').textContent = '';
    document.getElementById('upload-step').textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('name', name);
    formData.append('file', file);

    try {
        const res = await fetch('/api/animations/upload', {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();
        if (data.error) {
            document.getElementById('upload-step').textContent = `Error: ${data.error}`;
        }
        // Progress updates come via WebSocket
    } catch (e) {
        document.getElementById('upload-step').textContent = `Error: ${e.message}`;
    }
});

function updateUploadProgress(data) {
    document.getElementById('upload-step').textContent = data.step || 'Processing...';
    if (data.output) {
        const output = document.getElementById('upload-output');
        output.textContent += data.output;
        output.scrollTop = output.scrollHeight;
    }
    if (data.status === 'done') {
        document.getElementById('upload-step').textContent = 'Done! Animation added.';
        loadAnimations();
    }
    if (data.status === 'error') {
        document.getElementById('upload-step').textContent = `Error: ${data.error || 'Upload failed'}`;
    }
}

// ============================================================================
// 6. Settings
// ============================================================================

async function loadSerialPorts() {
    try {
        const res = await fetch('/api/serial/ports');
        const ports = await res.json();
        const select = document.getElementById('serial-port');
        select.innerHTML = '';
        for (const port of ports) {
            const opt = document.createElement('option');
            opt.value = port.path;
            opt.textContent = `${port.path} (${port.manufacturer || port.vendorId || 'unknown'})`;
            select.appendChild(opt);
        }
    } catch (e) {
        console.error('Failed to load serial ports:', e);
    }
}

document.getElementById('btn-connect').addEventListener('click', async () => {
    const port = document.getElementById('serial-port').value;
    if (!port) return;
    try {
        await fetch('/api/serial/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port }),
        });
    } catch (e) {
        console.error('Connect failed:', e);
    }
});

document.getElementById('btn-disconnect').addEventListener('click', async () => {
    try {
        await fetch('/api/serial/disconnect', { method: 'POST' });
    } catch (e) {
        console.error('Disconnect failed:', e);
    }
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const settings = {
        pollInterval: parseInt(document.getElementById('poll-interval').value, 10),
        verbose: document.getElementById('verbose-toggle').checked,
    };
    try {
        await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });
    } catch (e) {
        console.error('Save settings failed:', e);
    }
});

// ============================================================================
// 7. Logs
// ============================================================================

async function loadLogs() {
    try {
        const res = await fetch('/api/daemon/logs');
        const data = await res.json();
        const viewer = document.getElementById('log-viewer');
        viewer.innerHTML = '';
        for (const line of data.lines) {
            appendLog(line);
        }
    } catch (e) {
        console.error('Failed to load logs:', e);
    }
}

function appendLog(entry) {
    const viewer = document.getElementById('log-viewer');
    const div = document.createElement('div');
    div.className = `log-line ${entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : ''}`;

    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
    div.textContent = `${time} ${entry.message}`;

    viewer.appendChild(div);

    // Keep max 500 lines in DOM
    while (viewer.children.length > 500) {
        viewer.removeChild(viewer.firstChild);
    }

    // Auto-scroll if near bottom
    const isNearBottom = viewer.scrollHeight - viewer.scrollTop - viewer.clientHeight < 50;
    if (isNearBottom) {
        viewer.scrollTop = viewer.scrollHeight;
    }
}

// ============================================================================
// 8. Utility Functions
// ============================================================================

function toggleSection(id) {
    const el = document.getElementById(id);
    el.classList.toggle('hidden');
    const icon = el.previousElementSibling.querySelector('.toggle-icon');
    if (icon) {
        icon.textContent = el.classList.contains('hidden') ? '+' : '-';
    }
}

function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    loadAnimations();
    loadLogs();
    loadSerialPorts();
});
