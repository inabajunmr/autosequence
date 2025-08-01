let currentDiagramCode = '';
let allRequests = [];
let selectedDomains = new Set();

// Mermaidを初期化
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
  document.getElementById('select-all-btn').addEventListener('click', selectAllDomains);
  document.getElementById('select-none-btn').addEventListener('click', selectNoneDomains);
  document.getElementById('apply-filter-btn').addEventListener('click', applyDomainFilter);
});

function loadDiagram() {
  console.log('Loading diagram...');
  chrome.storage.local.get(['requests'], function(result) {
    console.log('Storage result:', result);
    const diagramDiv = document.getElementById('diagram');
    
    if (result.requests && result.requests.length > 0) {
      allRequests = result.requests;
      const domains = new Set(allRequests.map(req => req.domain));
      
      // 統計を更新
      document.getElementById('request-count').textContent = allRequests.length;
      document.getElementById('domain-count').textContent = domains.size;
      
      // ドメイン選択UIを構築
      buildDomainFilter(Array.from(domains));
      
      // 初期選択は全ドメイン
      selectedDomains = new Set(domains);
      
      // ダイアグラムを生成・表示
      updateDiagram();
    } else {
      // デフォルトダイアグラムを表示
      currentDiagramCode = "sequenceDiagram\n    Note over Browser: No requests recorded\n    Note over Browser: Click 'Start' in popup to begin recording";
      
      mermaid.render('mermaid-diagram', currentDiagramCode)
        .then(({svg}) => {
          diagramDiv.innerHTML = svg;
        })
        .catch(error => {
          diagramDiv.innerHTML = '<div class="error">リクエストデータが見つかりません。拡張機能のポップアップで記録を開始してください。</div>';
        });
    }
  });
}

function generateMermaidFromRequests(requests, selectedDomains = null) {
  if (!requests || requests.length === 0) {
    return "sequenceDiagram\n    Note over Browser: No requests recorded";
  }
  
  // 選択されたドメインでフィルタリング
  const filteredRequests = selectedDomains ? 
    requests.filter(req => selectedDomains.has(req.domain)) : 
    requests;
  
  if (filteredRequests.length === 0) {
    return "sequenceDiagram\n    Note over Browser: No requests for selected domains";
  }
  
  let diagram = "sequenceDiagram\n";
  
  // 選択されたドメインのみでparticipantを定義
  const domains = selectedDomains ? 
    Array.from(selectedDomains).sort() : 
    Array.from(new Set(requests.map(req => req.domain))).sort();
    
  domains.forEach(domain => {
    const alias = domain.replace(/[.-]/g, '_');
    diagram += `    participant ${alias} as ${domain}\n`;
  });
  
  diagram += "\n";
  
  // リクエストをタイムスタンプ順にソート
  const sortedRequests = filteredRequests.sort((a, b) => a.timestamp - b.timestamp);
  
  // シーケンスを生成（最大50件）
  sortedRequests.slice(0, 50).forEach((req, index) => {
    const fromAlias = "Browser";
    const toAlias = req.domain.replace(/[.-]/g, '_');
    const method = req.method;
    const path = new URL(req.url).pathname.substring(0, 30); // パスを短縮
    const status = req.statusCode || "pending";
    
    // リクエスト
    diagram += `    ${fromAlias}->>+${toAlias}: ${method} ${path}\n`;
    
    // レスポンス
    if (req.completed) {
      diagram += `    ${toAlias}-->>-${fromAlias}: ${status}\n`;
    } else {
      diagram += `    ${toAlias}-->>-${fromAlias}: (pending)\n`;
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
    alert('エクスポートするダイアグラムがありません');
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
    alert('コピーするコードがありません');
    return;
  }
  
  console.log('Copying code:', currentDiagramCode);
  
  navigator.clipboard.writeText(currentDiagramCode).then(() => {
    alert('Mermaidコードをクリップボードにコピーしました');
  }).catch(err => {
    console.error('クリップボードへのコピーに失敗:', err);
    // フォールバック: テキストエリアを使用
    const textarea = document.createElement('textarea');
    textarea.value = currentDiagramCode;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('Mermaidコードをクリップボードにコピーしました');
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

function applyDomainFilter() {
  updateDiagram();
}

function updateDiagram() {
  const diagramDiv = document.getElementById('diagram');
  
  // Mermaidダイアグラムを生成
  currentDiagramCode = generateMermaidFromRequests(allRequests, selectedDomains);
  console.log('Generated filtered diagram:', currentDiagramCode);
  
  // 統計を更新
  const filteredRequests = allRequests.filter(req => selectedDomains.has(req.domain));
  document.getElementById('request-count').textContent = `${filteredRequests.length} / ${allRequests.length}`;
  document.getElementById('domain-count').textContent = `${selectedDomains.size} / ${new Set(allRequests.map(req => req.domain)).size}`;
  
  // Mermaidダイアグラムをレンダリング
  mermaid.render('mermaid-diagram-filtered', currentDiagramCode)
    .then(({svg}) => {
      diagramDiv.innerHTML = svg;
    })
    .catch(error => {
      console.error('Mermaid rendering error:', error);
      diagramDiv.innerHTML = `<div class="error">ダイアグラムの生成に失敗しました: ${error.message}</div>`;
    });
}