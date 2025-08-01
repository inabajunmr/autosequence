let currentDiagramCode = '';

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
});

function loadDiagram() {
  console.log('Loading diagram...');
  chrome.storage.local.get(['requests'], function(result) {
    console.log('Storage result:', result);
    const diagramDiv = document.getElementById('diagram');
    
    if (result.requests && result.requests.length > 0) {
      const requests = result.requests;
      const domains = new Set(requests.map(req => req.domain));
      
      // 統計を更新
      document.getElementById('request-count').textContent = requests.length;
      document.getElementById('domain-count').textContent = domains.size;
      
      // Mermaidダイアグラムを生成
      currentDiagramCode = generateMermaidFromRequests(requests);
      console.log('Generated diagram:', currentDiagramCode);
      
      // Mermaidダイアグラムをレンダリング
      mermaid.render('mermaid-diagram', currentDiagramCode)
        .then(({svg}) => {
          diagramDiv.innerHTML = svg;
        })
        .catch(error => {
          console.error('Mermaid rendering error:', error);
          diagramDiv.innerHTML = `<div class="error">ダイアグラムの生成に失敗しました: ${error.message}</div>`;
        });
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

function generateMermaidFromRequests(requests) {
  if (!requests || requests.length === 0) {
    return "sequenceDiagram\n    Note over Browser: No requests recorded";
  }
  
  let diagram = "sequenceDiagram\n";
  
  // ドメインを抽出してparticipantを定義
  const domains = Array.from(new Set(requests.map(req => req.domain))).sort();
  domains.forEach(domain => {
    const alias = domain.replace(/[.-]/g, '_');
    diagram += `    participant ${alias} as ${domain}\n`;
  });
  
  diagram += "\n";
  
  // 完了していないリクエストも含める（レスポンスなしとして）
  const allRequests = requests.sort((a, b) => a.timestamp - b.timestamp);
  
  // シーケンスを生成（最大50件）
  allRequests.slice(0, 50).forEach((req, index) => {
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
  
  if (allRequests.length > 50) {
    diagram += `    Note over Browser: ... (${allRequests.length - 50} more requests)\n`;
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