console.log('Background script loaded');

let isRecording = false;
let recordedRequests = [];
let domainMap = new Map();
let requestId = 0;
let diagramTabIds = new Set();

// Capture HTTP requests using WebRequest API
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (!isRecording) return;
    
    // Exclude extension's own requests
    if (details.url.startsWith('chrome-extension://')) return;
    
    const url = new URL(details.url);
    const domain = url.hostname;
    const timestamp = Date.now();
    
    // Manage domains as participants
    if (!domainMap.has(domain)) {
      domainMap.set(domain, domainMap.size + 1);
    }
    
    const request = {
      id: ++requestId,
      method: details.method,
      url: details.url,
      domain: domain,
      timestamp: timestamp,
      type: details.type,
      tabId: details.tabId
    };
    
    recordedRequests.push(request);
    console.log('Request recorded:', request);
    
    // Save to storage
    chrome.storage.local.set({
      requests: recordedRequests,
      domains: Array.from(domainMap.entries())
    });
    
    // Notify diagram tabs of new request
    notifyDiagramTabs('requestAdded', request);
  },
  {urls: ["<all_urls>"]},
  ["requestBody"]
);

// Record responses as well
chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (!isRecording) return;
    
    // Find and update corresponding request (more flexible search)
    const request = recordedRequests.find(req => 
      req.url === details.url && 
      req.tabId === details.tabId &&
      !req.completed
    );
    
    if (request) {
      request.statusCode = details.statusCode;
      request.completed = true;
      request.responseTime = Date.now() - request.timestamp;
      console.log('Request completed:', request);
      
      // Notify diagram tabs of request completion
      notifyDiagramTabs('requestCompleted', request);
    } else {
      // Debug info when not found
      console.log('No matching request found for:', details.url, details.statusCode);
    }
  },
  {urls: ["<all_urls>"]}
);

// Record redirects as well
chrome.webRequest.onBeforeRedirect.addListener(
  function(details) {
    if (!isRecording) return;
    
    // Mark redirect source request as completed
    const request = recordedRequests.find(req => 
      req.url === details.url && 
      req.tabId === details.tabId &&
      !req.completed
    );
    
    if (request) {
      request.statusCode = details.statusCode;
      request.completed = true;
      request.responseTime = Date.now() - request.timestamp;
      request.redirectUrl = details.redirectUrl;
      console.log('Request redirected:', request);
    }
  },
  {urls: ["<all_urls>"]}
);

// Record errors as well
chrome.webRequest.onErrorOccurred.addListener(
  function(details) {
    if (!isRecording) return;
    
    const request = recordedRequests.find(req => 
      req.url === details.url && 
      req.tabId === details.tabId &&
      !req.completed
    );
    
    if (request) {
      request.statusCode = 'Error';
      request.completed = true;
      request.error = details.error;
      request.responseTime = Date.now() - request.timestamp;
      console.log('Request failed:', request);
    }
  },
  {urls: ["<all_urls>"]}
);

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  try {
    switch (request.action) {
      case 'startRecording':
        console.log('Starting recording...');
        isRecording = true;
        recordedRequests = [];
        domainMap.clear();
        requestId = 0;
        sendResponse({success: true});
        break;
        
      case 'stopRecording':
        console.log('Stopping recording...');
        isRecording = false;
        sendResponse({success: true});
        break;
        
      case 'getState':
        console.log('Getting state...');
        sendResponse({
          isRecording: isRecording,
          requestCount: recordedRequests.length,
          domainCount: domainMap.size
        });
        break;
        
      case 'getStats':
        sendResponse({
          requestCount: recordedRequests.length,
          domainCount: domainMap.size
        });
        break;
        
      case 'clearRecords':
        console.log('Clearing records...');
        recordedRequests = [];
        domainMap.clear();
        requestId = 0;
        chrome.storage.local.remove(['requests', 'domains']);
        sendResponse({success: true});
        break;
        
      case 'getSequenceDiagram':
        console.log('Generating diagram...');
        const diagram = generateMermaidDiagram();
        chrome.storage.local.set({diagram: diagram});
        sendResponse({diagram: diagram});
        break;
        
      case 'registerDiagramTab':
        console.log('Registering diagram tab:', sender.tab.id);
        diagramTabIds.add(sender.tab.id);
        sendResponse({success: true});
        break;
        
      case 'unregisterDiagramTab':
        console.log('Unregistering diagram tab:', sender.tab.id);
        diagramTabIds.delete(sender.tab.id);
        sendResponse({success: true});
        break;
        
      default:
        console.log('Unknown action:', request.action);
        sendResponse({error: 'Unknown action'});
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({error: error.message});
  }
  
  return true; // Asynchronous response
});

function generateMermaidDiagram() {
  if (recordedRequests.length === 0) {
    return "sequenceDiagram\n    Note over Browser: No requests recorded";
  }
  
  let diagram = "sequenceDiagram\n";
  
  // Define participants
  const participants = Array.from(domainMap.keys()).sort();
  participants.forEach(domain => {
    diagram += `    participant ${getDomainAlias(domain)} as ${domain}\n`;
  });
  
  diagram += "\n";
  
  // Sort requests by timestamp
  const sortedRequests = recordedRequests
    .filter(req => req.completed)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  // Generate sequence
  sortedRequests.forEach((req, index) => {
    if (index > 50) {
      diagram += `    Note over Browser: ... (${sortedRequests.length - index} more requests)\n`;
      return;
    }
    
    const fromAlias = "Browser";
    const toAlias = getDomainAlias(req.domain);
    const method = req.method;
    const path = new URL(req.url).pathname;
    const status = req.statusCode || "?";
    
    // Request
    diagram += `    ${fromAlias}->>+${toAlias}: ${method} ${path}\n`;
    
    // Response
    if (req.completed) {
      diagram += `    ${toAlias}-->>-${fromAlias}: ${status}\n`;
    }
  });
  
  return diagram;
}

function getDomainAlias(domain) {
  // Escape domain name to format usable in Mermaid
  return domain.replace(/[.-]/g, '_');
}

// Restore from storage on initialization
chrome.storage.local.get(['requests', 'domains'], function(result) {
  console.log('Restored from storage:', result);
  if (result.requests) {
    recordedRequests = result.requests;
  }
  if (result.domains) {
    domainMap = new Map(result.domains);
    requestId = recordedRequests.length;
  }
  console.log('Initial state:', {
    isRecording,
    requestCount: recordedRequests.length,
    domainCount: domainMap.size
  });
});

// Function to notify diagram tabs of updates
function notifyDiagramTabs(action, data) {
  if (diagramTabIds.size === 0) return;
  
  diagramTabIds.forEach(tabId => {
    chrome.tabs.sendMessage(tabId, {
      action: action,
      data: data
    }).catch(error => {
      // Remove inactive tabs
      console.log('Removing inactive diagram tab:', tabId);
      diagramTabIds.delete(tabId);
    });
  });
}

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  diagramTabIds.delete(tabId);
});