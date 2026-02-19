const form = document.getElementById("contactForm");
const successMessage = document.querySelector(".success-message");

form.addEventListener("submit", function (e) {
  e.preventDefault();

  let valid = true;

  const name = document.getElementById("name");
  const email = document.getElementById("email");
  const message = document.getElementById("message");

  clearErrors();

  if (name.value.trim() === "") {
    showError(name, "Name is required");
    valid = false;
  }

  if (!validateEmail(email.value.trim())) {
    showError(email, "Enter a valid email");
    valid = false;
  }

  if (message.value.trim().length < 10) {
    showError(message, "Message must be at least 10 characters");
    valid = false;
  }

  if (valid) {
    successMessage.textContent = "Message sent successfully!";
    form.reset();
  }
});

function showError(input, message) {
  const error = input.parentElement.querySelector(".error");
  if (error) {
    error.textContent = message;
  }
}

function clearErrors() {
  document.querySelectorAll(".error").forEach((el) => {
    el.textContent = "";
  });
  successMessage.textContent = "";
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const toggleBtn = document.getElementById("toggleBtn");
const moreInfo = document.getElementById("moreInfo");

toggleBtn.addEventListener("click", () => {
    if (moreInfo.style.display === "none" || moreInfo.style.display === "") {
        moreInfo.style.display = "block";
        toggleBtn.textContent = "Hide Details";
    } else {
        moreInfo.style.display = "none";
        toggleBtn.textContent = "View Details";
    }
});