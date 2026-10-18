(function () {
  "use strict";

  // Redirect if already logged in
  if (localStorage.getItem("spg_apikey")) {
    window.location.replace("/dashboard");
    return;
  }

  var mode = "login";

  var overlay = document.getElementById("modalOverlay");
  var tabLogin = document.getElementById("tabLogin");
  var tabSignup = document.getElementById("tabSignup");
  var submitBtn = document.getElementById("submitBtn");
  var errorMsg = document.getElementById("errorMsg");
  var emailInput = document.getElementById("email");

  function openModal(initialMode) {
    mode = initialMode;
    updateTabUI();
    overlay.classList.add("open");
    errorMsg.textContent = "";
    emailInput.focus();
  }

  function closeModal() {
    overlay.classList.remove("open");
    errorMsg.textContent = "";
    document.getElementById("authForm").reset();
  }

  function updateTabUI() {
    if (mode === "login") {
      tabLogin.classList.add("active");
      tabSignup.classList.remove("active");
      submitBtn.textContent = "Log in";
      document.getElementById("password").setAttribute("autocomplete", "current-password");
    } else {
      tabSignup.classList.add("active");
      tabLogin.classList.remove("active");
      submitBtn.textContent = "Create account";
      document.getElementById("password").setAttribute("autocomplete", "new-password");
    }
  }

  document.getElementById("loginBtn").addEventListener("click", function () { openModal("login"); });
  document.getElementById("signupBtn").addEventListener("click", function () { openModal("signup"); });
  document.getElementById("getStartedBtn").addEventListener("click", function () { openModal("signup"); });
  document.getElementById("modalClose").addEventListener("click", closeModal);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  tabLogin.addEventListener("click", function () {
    mode = "login";
    updateTabUI();
    errorMsg.textContent = "";
  });

  tabSignup.addEventListener("click", function () {
    mode = "signup";
    updateTabUI();
    errorMsg.textContent = "";
  });

  document.getElementById("authForm").addEventListener("submit", function (e) {
    e.preventDefault();
    errorMsg.textContent = "";

    var email = emailInput.value.trim();
    var password = document.getElementById("password").value;

    if (!email || !password) {
      errorMsg.textContent = "Email and password are required.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "login" ? "Logging in…" : "Creating account…";

    var endpoint = mode === "login" ? "/api/login" : "/api/register";

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          errorMsg.textContent = result.data.error || "Something went wrong.";
          submitBtn.disabled = false;
          updateTabUI();
          return;
        }
        // Store in localStorage — no cookies, so no CSRF risk
        localStorage.setItem("spg_email", result.data.email);
        localStorage.setItem("spg_apikey", result.data.apiKey);
        window.location.replace("/dashboard");
      })
      .catch(function () {
        errorMsg.textContent = "Network error. Please try again.";
        submitBtn.disabled = false;
        updateTabUI();
      });
  });
})();
