let currentDiagramCode = '';
let allRequests = [];
let selectedDomains = new Set();
let selectedTypes = new Set();

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  sequence: {
    diagramMarginX: 50,
    diagramMarginY: 10,
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35
  }
});

document.addEventListener('DOMContentLoaded', function() {
  loadDiagram();
  
  document.getElementById('refresh-btn').addEventListener('click', loadDiagram);
  document.getElementById('export-btn').addEventListener('click', exportSVG);
  document.getElementById('copy-btn').addEventListener('click', copyMermaidCode);
  document.getElementById('select-all-domains-btn').addEventListener('click', selectAllDomains);
  document.getElementById('select-none-domains-btn').addEventListener('click', selectNoneDomains);
  document.getElementById('select-all-types-btn').addEventListener('click', selectAllTypes);
  document.getElementById('select-none-types-btn').addEventListener('click', selectNoneTypes);
  document.getElementById('apply-filter-btn').addEventListener('click', applyFilter);
});

function loadDiagram() {
  console.log('Loading diagram...');
  chrome.storage.local.get(['requests'], function(result) {
    console.log('Storage result:', result);
    const diagramDiv = document.getElementById('diagram');
    
    if (result.requests && result.requests.length > 0) {
      allRequests = result.requests;
      const domains = new Set(allRequests.map(req => req.domain));
      const types = new Set(allRequests.map(req => getContentType(req)));
      
      // Update statistics
      document.getElementById('request-count').textContent = allRequests.length;
      document.getElementById('domain-count').textContent = domains.size;
      
      // Build filter UI
      buildDomainFilter(Array.from(domains));
      buildTypeFilter(Array.from(types));
      
      // Initial selection is all domains, only xhr and document
      selectedDomains = new Set(domains);
      selectedTypes = new Set(['xhr', 'document']);
      
      // Generate and display diagram
      updateDiagram();
    } else {
      // Display default diagram
      currentDiagramCode = "sequenceDiagram\n    Note over Browser: No requests recorded\n    Note over Browser: Click 'Start' in popup to begin recording";
      
      mermaid.render('mermaid-diagram', currentDiagramCode)
        .then(({svg}) => {
          diagramDiv.innerHTML = svg;
        })
        .catch(error => {
          diagramDiv.innerHTML = '<div class="error">No request data found. Please start recording from the extension popup.</div>';
        });
    }
  });
}

function generateMermaidFromRequests(requests, selectedDomains = null, selectedTypes = null) {
  if (!requests || requests.length === 0) {
    return "sequenceDiagram\n    Note over Browser: No requests recorded";
  }
  
  // Filter by selected domains and types
  let filteredRequests = requests;
  
  if (selectedDomains) {
    filteredRequests = filteredRequests.filter(req => selectedDomains.has(req.domain));
  }
  
  if (selectedTypes) {
    filteredRequests = filteredRequests.filter(req => selectedTypes.has(getContentType(req)));
  }
  
  if (filteredRequests.length === 0) {
    return "sequenceDiagram\n    Note over Browser: No requests for selected filters";
  }
  
  let diagram = "sequenceDiagram\n";
  
  // Always define Browser as the first participant
  diagram += `    participant Browser\n`;
  
  // Extract domains from filtered requests
  const domains = Array.from(new Set(filteredRequests.map(req => req.domain))).sort();
    
  domains.forEach(domain => {
    const alias = domain.replace(/[.-]/g, '_');
    diagram += `    participant ${alias} as ${domain}\n`;
  });
  
  diagram += "\n";
  
  // Sort requests by timestamp
  const sortedRequests = filteredRequests.sort((a, b) => a.timestamp - b.timestamp);
  
  // Generate sequence (max 50 requests)
  sortedRequests.slice(0, 50).forEach((req, index) => {
    const fromAlias = "Browser";
    const toAlias = req.domain.replace(/[.-]/g, '_');
    const method = req.method;
    const path = new URL(req.url).pathname;
    const contentType = getContentType(req);
    const status = req.statusCode || "pending";
    
    // Request (display content type)
    diagram += `    ${fromAlias}->>+${toAlias}: ${method} ${path} [${contentType}]\n`;
    
    // Response
    if (req.completed) {
      let responseText = status;
      if (req.redirectUrl) {
        const redirectDomain = new URL(req.redirectUrl).hostname;
        responseText += ` → ${redirectDomain}`;
      }
      if (req.error) {
        responseText = `Error: ${req.error}`;
      }
      diagram += `    ${toAlias}-->>-${fromAlias}: ${responseText}\n`;
    }
  });
  
  if (sortedRequests.length > 50) {
    diagram += `    Note over Browser: ... (${sortedRequests.length - 50} more requests)\n`;
  }
  
  return diagram;
}

function exportSVG() {
  const svg = document.querySelector('#diagram svg');
  if (!svg) {
    alert('No diagram to export');
    return;
  }
  
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], {type: 'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sequence-diagram.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copyMermaidCode() {
  if (!currentDiagramCode || currentDiagramCode.trim() === '') {
    alert('No code to copy');
    return;
  }
  
  console.log('Copying code:', currentDiagramCode);
  
  navigator.clipboard.writeText(currentDiagramCode).then(() => {
    alert('Mermaid code copied to clipboard');
  }).catch(err => {
    console.error('Failed to copy to clipboard:', err);
    // Fallback: use textarea
    const textarea = document.createElement('textarea');
    textarea.value = currentDiagramCode;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('Mermaid code copied to clipboard');
  });
}

function buildDomainFilter(domains) {
  const domainList = document.getElementById('domain-list');
  domainList.innerHTML = '';
  
  domains.sort().forEach(domain => {
    const checkbox = document.createElement('label');
    checkbox.className = 'domain-checkbox selected';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.value = domain;
    input.addEventListener('change', function() {
      if (this.checked) {
        selectedDomains.add(domain);
        checkbox.classList.add('selected');
      } else {
        selectedDomains.delete(domain);
        checkbox.classList.remove('selected');
      }
    });
    
    const label = document.createElement('span');
    label.textContent = domain;
    
    checkbox.appendChild(input);
    checkbox.appendChild(label);
    domainList.appendChild(checkbox);
  });
}

function selectAllDomains() {
  const checkboxes = document.querySelectorAll('#domain-list input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = true;
    selectedDomains.add(checkbox.value);
    checkbox.parentElement.classList.add('selected');
  });
}

function selectNoneDomains() {
  const checkboxes = document.querySelectorAll('#domain-list input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
    selectedDomains.delete(checkbox.value);
    checkbox.parentElement.classList.remove('selected');
  });
}

function getContentType(request) {
  // Determine content type based on WebRequest API type
  switch (request.type) {
    case 'main_frame':
    case 'sub_frame':
      return 'document';
    case 'stylesheet':
      return 'css';
    case 'script':
      return 'js';
    case 'image':
      return 'image';
    case 'font':
      return 'font';
    case 'xmlhttprequest':
      return 'xhr';
    case 'websocket':
      return 'websocket';
    case 'media':
      return 'media';
    case 'other':
      // Try to determine from URL extension
      const url = request.url.toLowerCase();
      if (url.includes('.css')) return 'css';
      if (url.includes('.js')) return 'js';
      if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?|$)/)) return 'image';
      if (url.match(/\.(woff|woff2|ttf|eot)(\?|$)/)) return 'font';
      return 'other';
    default:
      return request.type || 'unknown';
  }
}

function buildTypeFilter(types) {
  const typeList = document.getElementById('type-list');
  typeList.innerHTML = '';
  
  // Define type order
  const typeOrder = ['document', 'css', 'js', 'image', 'font', 'xhr', 'websocket', 'media', 'other', 'unknown'];
  const sortedTypes = types.sort((a, b) => {
    const indexA = typeOrder.indexOf(a);
    const indexB = typeOrder.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });
  
  sortedTypes.forEach(type => {
    const checkbox = document.createElement('label');
    const isDefaultSelected = type === 'xhr' || type === 'document';
    checkbox.className = isDefaultSelected ? 'domain-checkbox selected' : 'domain-checkbox';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = isDefaultSelected;
    input.value = type;
    input.addEventListener('change', function() {
      if (this.checked) {
        selectedTypes.add(type);
        checkbox.classList.add('selected');
      } else {
        selectedTypes.delete(type);
        checkbox.classList.remove('selected');
      }
    });
    
    const label = document.createElement('span');
    label.textContent = type;
    
    checkbox.appendChild(input);
    checkbox.appendChild(label);
    typeList.appendChild(checkbox);
  });
}

function selectAllTypes() {
  const checkboxes = document.querySelectorAll('#type-list input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = true;
    selectedTypes.add(checkbox.value);
    checkbox.parentElement.classList.add('selected');
  });
}

function selectNoneTypes() {
  const checkboxes = document.querySelectorAll('#type-list input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
    selectedTypes.delete(checkbox.value);
    checkbox.parentElement.classList.remove('selected');
  });
}

function applyFilter() {
  updateDiagram();
}

function updateDiagram() {
  const diagramDiv = document.getElementById('diagram');
  
  // Generate Mermaid diagram
  currentDiagramCode = generateMermaidFromRequests(allRequests, selectedDomains, selectedTypes);
  console.log('Generated filtered diagram:', currentDiagramCode);
  
  // Update statistics
  let filteredRequests = allRequests.filter(req => selectedDomains.has(req.domain));
  filteredRequests = filteredRequests.filter(req => selectedTypes.has(getContentType(req)));
  
  document.getElementById('request-count').textContent = `${filteredRequests.length} / ${allRequests.length}`;
  document.getElementById('domain-count').textContent = `${selectedDomains.size} / ${new Set(allRequests.map(req => req.domain)).size}`;
  
  // Render Mermaid diagram
  mermaid.render('mermaid-diagram-filtered', currentDiagramCode)
    .then(({svg}) => {
      diagramDiv.innerHTML = svg;
    })
    .catch(error => {
      console.error('Mermaid rendering error:', error);
      diagramDiv.innerHTML = `<div class="error">Failed to generate diagram: ${error.message}</div>`;
    });
}