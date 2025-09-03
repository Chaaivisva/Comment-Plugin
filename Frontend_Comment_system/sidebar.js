const API_BASE = "http://127.0.0.1:8000/api";
const token = localStorage.getItem("authToken");

if (!token) {
  alert("Please login first.");
  window.location.href = "login.html";
}

const commentsList = document.getElementById("commentsList");
const replyForm = document.getElementById("replyForm");
let currentCommentId = null;

// Fetch comments for this page
async function loadComments() {
  try {
    const res = await fetch(`${API_BASE}/comments/?page_url=${encodeURIComponent(window.location.href)}`, {
      headers: { "Authorization": `Token ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch comments");

    const data = await res.json();
    commentsList.innerHTML = "";

    data.forEach((c) => {
      const div = document.createElement("div");
      div.className = "p-3 border rounded-lg bg-gray-50";

      div.innerHTML = `
        <p class="text-sm text-gray-800"><strong>${c.user}</strong>: ${c.text}</p>
        <p class="text-xs text-gray-500">Tagged: ${c.tagged_email || "None"}</p>
        <button class="mt-2 text-xs text-indigo-600 hover:underline replyBtn" data-id="${c.id}">
          Reply
        </button>
        <div class="ml-3 mt-2 space-y-1">
          ${c.replies.map(r => `<p class="text-sm text-gray-700"><strong>${r.user}</strong>: ${r.text}</p>`).join("")}
        </div>
      `;
      commentsList.appendChild(div);
    });

    // Attach reply buttons
    document.querySelectorAll(".replyBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        currentCommentId = btn.dataset.id;
        document.getElementById("replyText").focus();
      });
    });
  } catch (err) {
    console.error(err);
  }
}

// Submit reply
replyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const replyText = document.getElementById("replyText").value.trim();
  if (!replyText || !currentCommentId) return;

  try {
    const res = await fetch(`${API_BASE}/comments/${currentCommentId}/reply/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${token}`,
      },
      body: JSON.stringify({ text: replyText }),
    });

    if (!res.ok) throw new Error("Failed to post reply");

    document.getElementById("replyForm").reset();
    loadComments(); // reload comments
  } catch (err) {
    console.error(err);
  }
});

// Load comments on page load
document.addEventListener("DOMContentLoaded", loadComments);
