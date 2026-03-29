const style = document.createElement('style');
style.textContent = `
.side-panel {
  position: fixed;
  top: 0;
  right: -260px;
  width: 260px;
  height: 100%;
  background: #f4f4f4;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  padding: 20px;
  box-sizing: border-box;
  transition: right 0.25s ease;

  display: flex;
  flex-direction: column;
}

.side-panel-title {
  text-align: center;
  margin-top: 5px;
  padding-top: 0;
}

.side-panel.open {
  right: 0;
}
.side-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.side-panel-title {
  text-align: center;
  margin: 0;
  padding: 0;
}

.clear-logs-button {
  border: 1px solid #999;
  background: #ececec;
  color: #222;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
}

.clear-logs-button:hover {
  background: #dddddd;
}

.clear-logs-button:active {
  background: #d2d2d2;
}

.logs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
}

.log-entry {
  background: #e9ecef;
  border-left: 4px solid #5b7c99;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
  color: #222;
  word-break: break-word;
}

.log-entry-warn {
  background: #dde1d3;
  border-left: 4px solid #958f51;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
  color: #222;
  word-break: break-word;
}

.log-entry-error {
  background: #e08080;
  border-left: 4px solid #a21401;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
  color: #222;
  word-break: break-word;
}

.log-entry-info {
  background: #91d996;
  border-left: 4px solid #169924;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
  color: #222;
  word-break: break-word;
}
`;
document.head.appendChild(style);



const sidePanelHTML =`<div id="sidePanel" class="side-panel">
                        <div class="side-panel-header">
                            <h2 class="side-panel-title">Logs</h2>
                            <button id="clearLogsButton" class="clear-logs-button" type="button">Clear</button>
                        </div>
                        <hr>
                        <div class="logs" id="logdiv"></div>
                      </div>
                      `;

document.body.insertAdjacentHTML('afterbegin', sidePanelHTML);

const sidePanel = document.getElementById("sidePanel");
const logDiv = document.getElementById("logdiv");
const clearLogsButton = document.getElementById("clearLogsButton");
const MAX_LOG_ENTRIES = 100;


clearLogsButton.addEventListener("click", function () {
  logDiv.innerHTML = "";
});

function closePanel() {
  sidePanel.classList.remove("open");
}

function togglePanel() {
  sidePanel.classList.toggle("open");
}

document.addEventListener("keydown", function(event) {
  if (event.key === "p" || event.key === "P") {
    togglePanel();
  }

  if (event.key === "Escape") {
    closePanel();
  }
});

export function log(msg, level = "none") {
  // If msg is an object or array, turn it into a pretty string
  let formattedMsg = msg;
  // Add this right before the JSON.stringify block
  if (msg instanceof Error) {
    formattedMsg = `${msg.message}\n${msg.stack}`;
  } else if (typeof msg === 'object' && msg !== null) {
    try {
      // The 'null, 2' adds 2-space indentation for readability
      formattedMsg = JSON.stringify(msg, null, 2); 
    } catch (e) {
      formattedMsg = "[Unserializable Object]";
    }
  }

  const msgElem = document.createElement("div");
  msgElem.style.whiteSpace = "pre-wrap"; // Keeps the indentation formatting
  
  // Use a map or switch for your new classes
  switch (level) {
    case "error":
      msgElem.classList.add("log-entry-error"); // Make this RED
      break;
    case "warn":
      msgElem.classList.add("log-entry-warn");  // Make this YELLOW
      break;
    case "info":
      msgElem.classList.add("log-entry-info");  // Make this BLUE or BOLD
      break;
    default:
      msgElem.classList.add("log-entry");
      break;
  }

  const textElem = document.createElement("span");
  textElem.textContent = formattedMsg;

  msgElem.appendChild(textElem);
  logDiv.appendChild(msgElem);

  while (logDiv.children.length > MAX_LOG_ENTRIES) {
      logDiv.removeChild(logDiv.firstElementChild);
  }

  logDiv.scrollTop = logDiv.scrollHeight;
}

// 1. Map console methods to your levels
const methods = ['log', 'warn', 'error', 'info'];
methods.forEach(method => {
    const original = console[method];
    console[method] = function(...args) {
        // Pass the method name directly as the level
        log(args.join(' '), method === 'log' ? 'none' : method);
        original.apply(console, args);
    };
});

// 2. Runtime Errors (Logic crashes) -> Style as "error"
window.onerror = function(msg, url, line) {
    log(`CRASH: ${msg} (Line: ${line})`, "error");
};

// 3. Async/Promise Rejections -> Style as "error"
window.onunhandledrejection = function(event) {
    log(`PROMISE FAIL: ${event.reason}`, "error");
};

// 4. Resource Failures (404s) -> Style as "warn"
window.addEventListener('error', function(event) {
    if (event.target && (event.target.src || event.target.href)) {
        log(`404 ERROR: ${event.target.src || event.target.href}`, "warn");
    }
}, true);

