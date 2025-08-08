document.addEventListener("DOMContentLoaded", function () {
  console.log("Popup loaded");

  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const viewBtn = document.getElementById("view-btn");
  const clearBtn = document.getElementById("clear-btn");
  const statusDiv = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  const requestCount = document.getElementById("request-count");
  const domainCount = document.getElementById("domain-count");

  console.log("Elements found:", {
    startBtn: !!startBtn,
    stopBtn: !!stopBtn,
    viewBtn: !!viewBtn,
    clearBtn: !!clearBtn,
  });

  // Load initial state
  loadState();

  startBtn.addEventListener("click", function () {
    console.log("Start button clicked");
    try {
      chrome.runtime.sendMessage(
        { action: "startRecording" },
        function (response) {
          console.log("Start recording response:", response);
          if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError);
            return;
          }
          if (response && response.success) {
            updateUI(true);
          } else {
            console.error("Failed to start recording:", response);
          }
        }
      );
    } catch (error) {
      console.error("Error sending message:", error);
    }
  });

  stopBtn.addEventListener("click", function () {
    chrome.runtime.sendMessage(
      { action: "stopRecording" },
      function (response) {
        updateUI(false);
      }
    );
  });

  viewBtn.addEventListener("click", function () {
    chrome.runtime.sendMessage(
      { action: "getSequenceDiagram" },
      function (response) {
        if (response.diagram) {
          const diagramUrl = chrome.runtime.getURL("diagram.html");
          chrome.tabs.create({ url: diagramUrl });
        }
      }
    );
  });

  clearBtn.addEventListener("click", function () {
    chrome.runtime.sendMessage({ action: "clearRecords" }, function (response) {
      updateStats(0, 0);
    });
  });

  function loadState() {
    console.log("Loading state...");
    chrome.runtime.sendMessage({ action: "getState" }, function (response) {
      console.log("State response:", response);
      if (chrome.runtime.lastError) {
        console.error("Runtime error in loadState:", chrome.runtime.lastError);
        return;
      }
      if (response) {
        updateUI(response.isRecording);
        updateStats(response.requestCount, response.domainCount);
      }
    });
  }

  function updateUI(isRecording) {
    if (isRecording) {
      statusDiv.className = "status recording";
      statusText.textContent = "Recording";
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      statusDiv.className = "status stopped";
      statusText.textContent = "Stopped";
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  }

  function updateStats(requests, domains) {
    requestCount.textContent = requests;
    domainCount.textContent = domains;
  }

  // Update statistics periodically
  setInterval(function () {
    chrome.runtime.sendMessage({ action: "getStats" }, function (response) {
      if (response) {
        updateStats(response.requestCount, response.domainCount);
      }
    });
  }, 1000);
});
