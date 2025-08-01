console.log('Background script loaded');

let isRecording = false;
let recordedRequests = [];
let domainMap = new Map();
let requestId = 0;

// WebRequest APIでHTTPリクエストをキャプチャ
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (!isRecording) return;
    
    // 拡張機能自体のリクエストは除外
    if (details.url.startsWith('chrome-extension://')) return;
    
    const url = new URL(details.url);
    const domain = url.hostname;
    const timestamp = Date.now();
    
    // ドメインをparticipantとして管理
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
    
    // ストレージに保存
    chrome.storage.local.set({
      requests: recordedRequests,
      domains: Array.from(domainMap.entries())
    });
  },
  {urls: ["<all_urls>"]},
  ["requestBody"]
);

// レスポンスも記録
chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (!isRecording) return;
    
    // 該当するリクエストを見つけて更新
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
    }
  },
  {urls: ["<all_urls>"]}
);

// ポップアップからのメッセージを処理
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
        
      default:
        console.log('Unknown action:', request.action);
        sendResponse({error: 'Unknown action'});
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({error: error.message});
  }
  
  return true; // 非同期レスポンス
});

function generateMermaidDiagram() {
  if (recordedRequests.length === 0) {
    return "sequenceDiagram\n    Note over Browser: No requests recorded";
  }
  
  let diagram = "sequenceDiagram\n";
  
  // participantを定義
  const participants = Array.from(domainMap.keys()).sort();
  participants.forEach(domain => {
    diagram += `    participant ${getDomainAlias(domain)} as ${domain}\n`;
  });
  
  diagram += "\n";
  
  // リクエストをタイムスタンプ順にソート
  const sortedRequests = recordedRequests
    .filter(req => req.completed)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  // シーケンスを生成
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
    
    // リクエスト
    diagram += `    ${fromAlias}->>+${toAlias}: ${method} ${path}\n`;
    
    // レスポンス
    if (req.completed) {
      diagram += `    ${toAlias}-->>-${fromAlias}: ${status}\n`;
    }
  });
  
  return diagram;
}

function getDomainAlias(domain) {
  // ドメイン名をMermaidで使える形式にエスケープ
  return domain.replace(/[.-]/g, '_');
}

// 初期化時にストレージから復元
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