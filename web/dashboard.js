(function () {
  "use strict";

  var email = localStorage.getItem("spg_email");
  var apiKey = localStorage.getItem("spg_apikey");

  // Guard: not logged in
  if (!apiKey) {
    window.location.replace("/");
    return;
  }

  var MASKED = "spg_" + "•".repeat(24); // spg_•••••••••••...
  var revealed = false;

  // Populate UI using textContent — never innerHTML — to prevent XSS
  document.getElementById("userEmail").textContent = email || "";

  var display = document.getElementById("apikeyDisplay");
  display.textContent = MASKED;

  var inlineKey = document.getElementById("inlineKey");
  inlineKey.textContent = apiKey;

  document.getElementById("revealBtn").addEventListener("click", function () {
    revealed = !revealed;
    display.textContent = revealed ? apiKey : MASKED;
    document.getElementById("revealBtn").textContent = revealed ? "Hide" : "Reveal";
  });

  document.getElementById("copyBtn").addEventListener("click", function () {
    if (!navigator.clipboard) {
      // Fallback for non-HTTPS or unsupported browsers
      var ta = document.createElement("textarea");
      ta.value = apiKey;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      flashCopyBtn();
      return;
    }
    navigator.clipboard.writeText(apiKey).then(flashCopyBtn).catch(function () {
      document.getElementById("copyBtn").textContent = "Failed";
    });
  });

  function flashCopyBtn() {
    var btn = document.getElementById("copyBtn");
    btn.textContent = "Copied!";
    setTimeout(function () { btn.textContent = "Copy"; }, 2000);
  }

  document.getElementById("logoutBtn").addEventListener("click", function () {
    localStorage.removeItem("spg_email");
    localStorage.removeItem("spg_apikey");
    window.location.replace("/");
  });
})();
