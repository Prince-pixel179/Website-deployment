import {
  signIn,
  signUp,
  signOut,
  getSession,
  getDoc,
  setDoc,
  create,
  listMine,
  listByField,
  listAll,
  update,
  remove,
} from "./firebase.js";

const byId = (id) => document.getElementById(id);
const loginPage = byId("login-page");
const registerPage = byId("register-page");
const publicHomepage = byId("public-homepage");
const learnerDashboard = byId("learner-dashboard");
const assessorDashboard = byId("assessor-dashboard");
const loginForm = byId("login-form");
const registerForm = byId("register-form");
const loginMessage = byId("login-message");
const registrationMessage = byId("registration-message");
const taskList = byId("taskList");
const taskForm = byId("task-form");
const supportForm = byId("support-request-form");
const learnerBookingsList = byId("learnerSupportRequests");
const assessorBookingsList = byId("assessorSupportRequests");
const assessorFeedbackForm = byId("assessor-feedback-form");
const learnerFeedbackList = byId("learnerFeedbackList");
const assessorFeedbackList = byId("assessorFeedbackList");
const learnerSearch = byId("learnerSearch");
const submissionList = byId("submissionList");

let currentSession = null;
let currentProfile = null;
let currentRole = null;
let tasks = [];
let bookings = [];
let feedbackRecords = [];
let allLearners = [];
let editingTaskId = null;
let gameQuestions = [];
let gameQuestionIndex = 0;
let gameScore = 0;
let gameQuestionAnswered = false;

const supportTopics = {
  web: "Web development",
  programming: "Programming",
  security: "Cybersecurity",
  networking: "Networking",
  data: "Data and databases",
  tools: "Tools and workflow",
  other: "Other",
};
const urgencyLabels = {
  standard: "When available",
  soon: "In the next few days",
  urgent: "As soon as possible",
};
const taskStatusLabels = {
  "not-started": "Not started",
  "in-progress": "In progress",
  submitted: "Submitted",
  reviewed: "Reviewed",
};
const topicQuestions = {
  html: [
    { question: "Which element is the main page heading?", options: ["<header>", "<h1>", "<title>", "<main>"], answer: 1, explanation: "The h1 element represents the main heading." },
    { question: "Which attribute describes an image for screen readers?", options: ["src", "alt", "href", "title"], answer: 1, explanation: "The alt attribute provides alternative text." },
    { question: "Which element creates a paragraph?", options: ["<p>", "<para>", "<text>", "<section>"], answer: 0, explanation: "Use the p element for a paragraph." },
  ],
  css: [
    { question: "Which property changes text color?", options: ["font-style", "color", "background", "text-size"], answer: 1, explanation: "The color property sets text color." },
    { question: "Which selector targets an element by its id?", options: [".name", "#name", "name()", "*name"], answer: 1, explanation: "An id selector begins with #." },
    { question: "What does display: flex enable?", options: ["Flexbox layout", "Text shadows", "Grid columns", "A web font"], answer: 0, explanation: "Flexbox arranges items along a flexible axis." },
  ],
  javascript: [
    { question: "Which keyword declares a constant?", options: ["let", "const", "varies", "static"], answer: 1, explanation: "Use const for a binding that is not reassigned." },
    { question: "Which method selects an element by CSS selector?", options: ["querySelector", "getStyle", "findNode", "selectElement"], answer: 0, explanation: "querySelector returns the first matching element." },
    { question: "What does an array's map method return?", options: ["A new transformed array", "A boolean", "The last item", "A sorted object"], answer: 0, explanation: "map creates a new array from each callback result." },
  ],
  cybersecurity: [
    { question: "What is a strong response to a suspicious attachment?", options: ["Open it", "Forward it", "Report it without opening", "Save it"], answer: 2, explanation: "Report suspicious files and do not open them." },
    { question: "What does multi-factor authentication add?", options: ["A second verification step", "A longer username", "A firewall", "An encrypted drive"], answer: 0, explanation: "It asks for another proof of identity." },
    { question: "What is the purpose of encryption?", options: ["Speed up a network", "Protect data from unauthorized reading", "Delete duplicates", "Improve screen quality"], answer: 1, explanation: "Encryption makes information unreadable without authorization." },
  ],
};

function setMessage(text) {
  const dashboard = currentRole === "assessor" ? assessorDashboard : learnerDashboard;
  let status = dashboard?.querySelector(".portal-message");
  if (!status) {
    const header = dashboard?.querySelector(".dashboard-header");
    if (!header) return;
    status = document.createElement("p");
    status.className = "portal-message login-message";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    header.insertAdjacentElement("afterend", status);
  }
  status.textContent = text || "";
}

function friendlyError(error) {
  console.error(error);
  if (error.message?.includes("PERMISSION_DENIED") || error.message?.includes("Missing or insufficient permissions")) {
    return "Firebase denied this action. Check the Firestore rules for the users and feedback collections.";
  }
  return (error.message || "Something went wrong.")
    .replaceAll("INVALID_LOGIN_CREDENTIALS", "Incorrect email or password.")
    .replaceAll("EMAIL_EXISTS", "This email is already registered.")
    .replaceAll("EMAIL_NOT_FOUND", "No account was found for this email.")
    .replaceAll("INVALID_PASSWORD", "Incorrect email or password.")
    .replaceAll("INVALID_EMAIL", "Please enter a valid email address.")
    .replaceAll("WEAK_PASSWORD", "Choose a stronger password.");
}

function showLogin() {
  publicHomepage.hidden = true;
  registerPage.hidden = true;
  learnerDashboard.hidden = true;
  assessorDashboard.hidden = true;
  loginPage.hidden = false;
  loginMessage.textContent = "";
}

function showRegister() {
  publicHomepage.hidden = true;
  loginPage.hidden = true;
  learnerDashboard.hidden = true;
  assessorDashboard.hidden = true;
  registerPage.hidden = false;
  registrationMessage.textContent = "";
}

function showHome() {
  loginPage.hidden = true;
  registerPage.hidden = true;
  learnerDashboard.hidden = true;
  assessorDashboard.hidden = true;
  publicHomepage.hidden = false;
}

function showSection(dashboard, target) {
  dashboard.querySelectorAll(".dashboard-section").forEach((section) => {
    section.hidden = section !== target;
  });
  dashboard.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === target.id);
  });
  target.hidden = false;
}

function navigateFromButton(button) {
  const dashboard = button.closest(".portal-dashboard");
  const sectionId = button.dataset.section;
  const target = dashboard?.querySelector(`#${sectionId}`);
  if (!dashboard || !target) return;
  showSection(dashboard, target);
  if (currentRole === "learner") {
    if (target.id === "dashboard-section" || target.id === "create-task-section") renderTasks();
    if (target.id === "support-section") loadLearnerBookings();
    if (target.id === "learner-feedback-section") loadLearnerFeedback();
  } else if (target.id === "learners-section" || target.id === "submissions-section") {
    loadAssessorWork();
  } else if (target.id === "feedback-section") {
    loadAssessorFeedback();
  } else if (target.id === "assessor-support-section") {
    loadAssessorBookings();
  }
}

async function loadProfile(session) {
  const profile = await getDoc("users", session.localId);
  if (!profile) throw new Error("Your account profile is missing. Please contact an assessor.");
  return profile;
}

async function enterPortal(session, requestedRole = null) {
  const profile = await loadProfile(session);
  const role = profile.role === "assessor" ? "assessor" : "learner";
  if (requestedRole && requestedRole !== role) {
    signOut();
    throw new Error(`This account is registered as ${role}. Choose the matching role to sign in.`);
  }
  currentSession = session;
  currentProfile = profile;
  currentRole = role;
  publicHomepage.hidden = true;
  loginPage.hidden = true;
  registerPage.hidden = true;
  learnerDashboard.hidden = role !== "learner";
  assessorDashboard.hidden = role !== "assessor";

  const dashboard = role === "assessor" ? assessorDashboard : learnerDashboard;
  const name = profile.displayName || profile.email || (role === "assessor" ? "Assessor" : "Learner");
  dashboard.querySelector(".dashboard-header h1").textContent = `Welcome back, ${name}`;
  const profileName = dashboard.querySelector(".learner-profile strong");
  const profileRole = dashboard.querySelector(".learner-profile span");
  const profileCircle = dashboard.querySelector(".profile-circle");
  if (profileName) profileName.textContent = name;
  if (profileRole) profileRole.textContent = role === "assessor" ? "Assessor" : "Learner";
  if (profileCircle) profileCircle.textContent = name.charAt(0).toUpperCase();
  showSection(dashboard, dashboard.querySelector(".dashboard-section"));

  if (role === "learner") {
    await Promise.all([loadTasks(), loadLearnerBookings()]);
  } else {
    await Promise.all([loadAssessorWork(), loadAssessorFeedback(), loadAssessorBookings()]);
  }
  setMessage("Your portal is ready.");
}

document.querySelectorAll("[data-open-auth]").forEach((button) => {
  button.addEventListener("click", () => {
    const role = button.dataset.role;
    if (role) {
      const roleInput = loginForm.querySelector(`input[name="user-role"][value="${role}"]`);
      if (roleInput) roleInput.checked = true;
    }
    if (button.dataset.openAuth === "register") showRegister();
    else showLogin();
  });
});

byId("show-register").addEventListener("click", showRegister);
byId("show-login").addEventListener("click", showLogin);

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Signing in...";
  const selectedRole = loginForm.querySelector('input[name="user-role"]:checked')?.value || "learner";
  try {
    const session = await signIn(byId("email").value.trim(), byId("password").value);
    await enterPortal(session, selectedRole);
    loginMessage.textContent = "";
  } catch (error) {
    loginMessage.textContent = friendlyError(error);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = byId("register-name").value.trim();
  const email = byId("register-email").value.trim();
  const password = byId("register-password").value;
  const confirmation = byId("confirm-password").value;
  if (password !== confirmation) {
    registrationMessage.textContent = "Passwords do not match.";
    byId("confirm-password").focus();
    return;
  }
  const selectedRole = registerForm.querySelector('input[name="register-role"]:checked')?.value;
  if (selectedRole !== "learner") {
    registrationMessage.textContent = "Assessor accounts are created by an administrator. Register as a learner or sign in with your assessor account.";
    return;
  }
  registrationMessage.textContent = "Creating your learner account...";
  try {
    const session = await signUp(email, password);
    await setDoc("users", session.localId, {
      email,
      displayName: name,
      role: "learner",
      createdAt: new Date().toISOString(),
    });
    await enterPortal(session, "learner");
    registrationMessage.textContent = "";
  } catch (error) {
    registrationMessage.textContent = friendlyError(error);
  }
});

function logOut() {
  signOut();
  currentSession = null;
  currentProfile = null;
  currentRole = null;
  tasks = [];
  bookings = [];
  feedbackRecords = [];
  loginForm.reset();
  registerForm.reset();
  showHome();
}

byId("logoutBtn").addEventListener("click", logOut);
byId("assessorLogoutBtn").addEventListener("click", logOut);

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => navigateFromButton(button));
});

function taskStatus(task) {
  return task.status || (task.completed ? "reviewed" : "not-started");
}

function updateLearnerStats() {
  const completed = tasks.filter((task) => task.completed || taskStatus(task) === "reviewed").length;
  byId("totalTasks").textContent = String(tasks.length);
  byId("completedTasks").textContent = String(completed);
  byId("outstandingTasks").textContent = String(tasks.length - completed);
  byId("progress").textContent = String(tasks.length ? Math.round((completed / tasks.length) * 100) : 0);
}

function renderTasks() {
  taskList.replaceChildren();
  updateLearnerStats();
  if (!tasks.length) {
    taskList.innerHTML = "<p>No tasks available yet.</p>";
    return;
  }
  tasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = "task-item";
    const details = document.createElement("div");
    details.className = "task-details";
    const title = document.createElement("h4");
    title.textContent = task.title;
    const description = document.createElement("p");
    description.textContent = task.description || "";
    const metadata = document.createElement("span");
    metadata.textContent = `${task.subject || "Other"} · ${task.category || "Other"} · ${task.priority || "medium"} priority${task.dueDate ? ` · Due ${task.dueDate}` : ""}`;
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = taskStatusLabels[taskStatus(task)] || "Not started";
    details.append(title, description, metadata, status);
    const progress = document.createElement("div");
    progress.className = "task-progress-ring";
    const complete = task.completed || taskStatus(task) === "reviewed";
    progress.style.setProperty("--task-progress", complete ? "100%" : "0%");
    progress.setAttribute("aria-label", complete ? "Task complete" : "Task incomplete");
    const percent = document.createElement("span");
    percent.textContent = complete ? "100%" : "0%";
    progress.appendChild(percent);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => beginTaskEdit(task));
    const completeButton = document.createElement("button");
    completeButton.type = "button";
    completeButton.textContent = complete ? "Reopen" : "Complete";
    completeButton.addEventListener("click", async () => {
      try {
        await update("tasks", task.id, { completed: !complete, status: complete ? "in-progress" : "submitted" });
        await loadTasks();
      } catch (error) {
        setMessage(`Could not update task: ${friendlyError(error)}`);
      }
    });
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "task-delete-button";
    removeButton.textContent = "Delete";
    removeButton.addEventListener("click", async () => {
      if (!window.confirm(`Delete “${task.title}”?`)) return;
      try {
        await remove("tasks", task.id);
        await loadTasks();
      } catch (error) {
        setMessage(`Could not delete task: ${friendlyError(error)}`);
      }
    });
    actions.append(edit, completeButton, removeButton);
    item.append(details, progress, actions);
    taskList.appendChild(item);
  });
}

function beginTaskEdit(task) {
  editingTaskId = task.id;
  byId("taskId").value = task.id;
  byId("taskTitle").value = task.title || "";
  byId("taskDescription").value = task.description || "";
  byId("taskSubject").value = task.subject || "other";
  byId("taskCategory").value = task.category || "other";
  byId("taskDueDate").value = task.dueDate || "";
  byId("taskPriority").value = task.priority || "medium";
  byId("addTaskBtn").textContent = "Save Changes";
  byId("cancelTaskEditBtn").hidden = false;
  byId("task-form-message").textContent = "Editing task. Update details and save.";
  showSection(learnerDashboard, byId("create-task-section"));
  byId("taskTitle").focus();
}

function resetTaskForm() {
  editingTaskId = null;
  taskForm.reset();
  byId("taskId").value = "";
  byId("addTaskBtn").textContent = "Create Task";
  byId("cancelTaskEditBtn").hidden = true;
  byId("task-form-message").textContent = "";
}

byId("cancelTaskEditBtn").addEventListener("click", resetTaskForm);
taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = {
    userId: currentSession.localId,
    learnerEmail: currentProfile.email,
    learnerName: currentProfile.displayName || currentProfile.email,
    title: byId("taskTitle").value.trim(),
    description: byId("taskDescription").value.trim(),
    subject: byId("taskSubject").value,
    category: byId("taskCategory").value,
    dueDate: byId("taskDueDate").value,
    priority: byId("taskPriority").value,
    updatedAt: new Date().toISOString(),
  };
  try {
    if (editingTaskId) await update("tasks", editingTaskId, task);
    else await create("tasks", { ...task, completed: false, status: "not-started", createdAt: new Date().toISOString() });
    resetTaskForm();
    await loadTasks();
    byId("task-form-message").textContent = "Task saved.";
    showSection(learnerDashboard, byId("dashboard-section"));
  } catch (error) {
    byId("task-form-message").textContent = `Could not save task: ${friendlyError(error)}`;
  }
});

async function loadTasks() {
  if (currentRole !== "learner") return;
  try {
    tasks = await listMine("tasks", currentSession.localId);
    renderTasks();
  } catch (error) {
    setMessage(`Could not load tasks: ${friendlyError(error)}`);
  }
}

function renderResources() {
  const selected = byId("resourceFilter").value;
  let visible = 0;
  document.querySelectorAll(".resource-card").forEach((card) => {
    const show = selected === "all" || card.dataset.topic === selected;
    card.hidden = !show;
    if (show) visible += 1;
  });
  byId("resourceEmptyState").hidden = visible > 0;
}
byId("resourceFilter").addEventListener("change", renderResources);

function formatBookingTime(booking) {
  const date = booking.preferredDate || booking.date;
  const time = booking.preferredTime || booking.time;
  if (!date) return "Date not selected";
  const parsed = new Date(`${date}T${time || "12:00"}`);
  return parsed.toLocaleString([], { dateStyle: "medium", timeStyle: time ? "short" : undefined });
}

function setMinimumBookingDate() {
  const now = new Date();
  byId("supportDate").min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
setMinimumBookingDate();

async function loadLearnerBookings() {
  if (currentRole !== "learner") return;
  try {
    bookings = await listMine("supportBookings", currentSession.localId);
    renderLearnerBookings();
  } catch (error) {
    byId("supportRequestStatus").textContent = `Could not load requests: ${friendlyError(error)}`;
  }
}

function renderLearnerBookings() {
  learnerBookingsList.replaceChildren();
  const learnerRequests = bookings.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (!learnerRequests.length) {
    learnerBookingsList.innerHTML = "<p>No support requests yet.</p>";
    return;
  }
  learnerRequests.forEach((booking) => {
    const entry = document.createElement("article");
    entry.className = "support-request-entry";
    const heading = document.createElement("div");
    heading.className = "support-request-heading";
    const title = document.createElement("strong");
    title.textContent = booking.subject || booking.topic || "Support session";
    const status = document.createElement("span");
    status.className = "support-request-badge";
    status.textContent = (booking.status || "pending").replaceAll("-", " ");
    heading.append(title, status);
    const topic = document.createElement("span");
    topic.className = "support-request-topic";
    topic.textContent = `${supportTopics[booking.topic] || booking.topic || "Support"} · ${urgencyLabels[booking.urgency] || "When available"} · ${formatBookingTime(booking)}`;
    const details = document.createElement("p");
    details.textContent = booking.message || booking.notes || "";
    entry.append(heading, topic, details);
    if (booking.response) {
      const response = document.createElement("p");
      response.className = "support-request-response";
      response.textContent = `Assessor: ${booking.response}`;
      entry.appendChild(response);
    }
    learnerBookingsList.appendChild(entry);
  });
}

supportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentRole !== "learner") return;
  if (byId("supportDate").value < byId("supportDate").min) {
    byId("supportRequestStatus").textContent = "Choose today or a future date.";
    return;
  }
  try {
    await create("supportBookings", {
      userId: currentSession.localId,
      email: currentProfile.email,
      learnerName: currentProfile.displayName || currentProfile.email,
      subject: byId("supportSubject").value.trim(),
      topic: byId("supportTopic").value,
      urgency: byId("supportUrgency").value,
      preferredDate: byId("supportDate").value,
      preferredTime: byId("supportTime").value,
      message: byId("supportMessage").value.trim(),
      status: "pending",
      response: "",
      createdAt: new Date().toISOString(),
    });
    supportForm.reset();
    setMinimumBookingDate();
    await loadLearnerBookings();
    byId("supportRequestStatus").textContent = "Session request submitted. You can track its status below.";
  } catch (error) {
    byId("supportRequestStatus").textContent = `Could not submit request: ${friendlyError(error)}`;
  }
});

async function loadAssessorBookings() {
  if (currentRole !== "assessor") return;
  try {
    bookings = await listAll("supportBookings");
    renderAssessorBookings();
  } catch (error) {
    assessorBookingsList.textContent = `Could not load bookings: ${friendlyError(error)}`;
  }
}

function renderAssessorBookings() {
  assessorBookingsList.replaceChildren();
  if (!bookings.length) {
    assessorBookingsList.innerHTML = "<p>No session requests yet.</p>";
    return;
  }
  bookings.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).forEach((booking) => {
    const entry = document.createElement("article");
    entry.className = "support-request-entry";
    const heading = document.createElement("div");
    heading.className = "support-request-heading";
    const learner = document.createElement("strong");
    learner.textContent = booking.learnerName || booking.email || "Learner";
    const requestTitle = document.createElement("span");
    requestTitle.className = "support-request-topic";
    requestTitle.textContent = booking.subject || "Support session";
    heading.append(learner, requestTitle);
    const metadata = document.createElement("span");
    metadata.className = "support-request-topic";
    metadata.textContent = `${supportTopics[booking.topic] || booking.topic || "Support"} · ${formatBookingTime(booking)}`;
    const details = document.createElement("p");
    details.textContent = booking.message || booking.notes || "";
    const controls = document.createElement("div");
    controls.className = "support-response-controls";
    const status = document.createElement("select");
    status.setAttribute("aria-label", `Status for ${learner.textContent}`);
    ["pending", "confirmed", "in-progress", "completed", "cancelled"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value.replaceAll("-", " ");
      option.selected = (booking.status || "pending") === value;
      status.appendChild(option);
    });
    const response = document.createElement("textarea");
    response.maxLength = 600;
    response.placeholder = "Message to learner (optional)";
    response.value = booking.response || "";
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save update";
    save.addEventListener("click", async () => {
      try {
        await update("supportBookings", booking.id, { status: status.value, response: response.value.trim() });
        await loadAssessorBookings();
        setMessage("Booking update saved.");
      } catch (error) {
        setMessage(`Could not update booking: ${friendlyError(error)}`);
      }
    });
    controls.append(status, response, save);
    entry.append(heading, metadata, details, controls);
    assessorBookingsList.appendChild(entry);
  });
}

async function loadAssessorWork() {
  if (currentRole !== "assessor") return;
  try {
    const [allTasks, users] = await Promise.all([listAll("tasks"), listAll("users")]);
    tasks = allTasks;
    allLearners = users.filter((user) => user.role !== "assessor");
    renderAssessorStats();
    renderLearnerOverview();
    renderSubmissions();
    renderRecentActivity();
  } catch (error) {
    setMessage(`Could not load learner work: ${friendlyError(error)}`);
  }
}

function renderAssessorStats() {
  const completed = tasks.filter((task) => taskStatus(task) === "reviewed").length;
  byId("totalLearners").textContent = String(allLearners.length);
  byId("pendingSubmissions").textContent = String(tasks.filter((task) => taskStatus(task) !== "reviewed").length);
  byId("reviewedSubmissions").textContent = String(completed);
  byId("feedbackGiven").textContent = String(feedbackRecords.length);
}

function renderLearnerOverview() {
  const list = byId("learnerList");
  const search = learnerSearch.value.trim().toLowerCase();
  const matching = allLearners.filter((learner) => `${learner.displayName || ""} ${learner.email || ""}`.toLowerCase().includes(search));
  list.replaceChildren();
  if (!matching.length) {
    list.innerHTML = "<p>No learner accounts match your search.</p>";
    return;
  }
  matching.forEach((learner) => {
    const learnerTasks = tasks.filter((task) => task.userId === learner.id);
    const card = document.createElement("article");
    card.className = "learner-work-card";
    const name = document.createElement("strong");
    name.textContent = learner.displayName || learner.email || "Learner";
    const summary = document.createElement("p");
    summary.textContent = `${learner.email || ""} · ${learnerTasks.length} task${learnerTasks.length === 1 ? "" : "s"} · ${learnerTasks.filter((task) => taskStatus(task) === "reviewed").length} reviewed`;
    card.append(name, summary);
    list.appendChild(card);
  });
}

function renderSubmissions() {
  submissionList.replaceChildren();
  if (!tasks.length) {
    submissionList.innerHTML = "<p>No learner work to review.</p>";
    return;
  }
  tasks.slice().sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).forEach((task) => {
    const entry = document.createElement("article");
    entry.className = "submission-entry";
    const name = document.createElement("strong");
    name.textContent = task.learnerName || task.learnerEmail || "Learner";
    const description = document.createElement("p");
    description.textContent = `${task.title || "Untitled"} · ${task.subject || "Other"} · ${task.category || "Other"}`;
    const status = document.createElement("select");
    status.setAttribute("aria-label", `Update status for ${task.title || "task"}`);
    Object.entries(taskStatusLabels).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = taskStatus(task) === value;
      status.appendChild(option);
    });
    status.addEventListener("change", async () => {
      try {
        await update("tasks", task.id, { status: status.value, completed: status.value === "reviewed" });
        await loadAssessorWork();
      } catch (error) {
        setMessage(`Could not update task status: ${friendlyError(error)}`);
      }
    });
    entry.append(name, description, status);
    submissionList.appendChild(entry);
  });
}

function renderRecentActivity() {
  const container = byId("recentActivity");
  container.replaceChildren();
  const recent = tasks.slice().sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).slice(0, 5);
  if (!recent.length) {
    container.innerHTML = "<p>No recent learner activity.</p>";
    return;
  }
  recent.forEach((task) => {
    const row = document.createElement("article");
    row.className = "activity-entry";
    const label = document.createElement("strong");
    label.textContent = task.learnerName || task.learnerEmail || "Learner";
    const title = document.createElement("span");
    title.textContent = task.title || "Task";
    const status = document.createElement("span");
    status.className = "activity-status";
    status.textContent = taskStatusLabels[taskStatus(task)] || "Not started";
    row.append(label, title, status);
    container.appendChild(row);
  });
}

learnerSearch.addEventListener("input", renderLearnerOverview);

async function loadLearnerFeedback() {
  if (currentRole !== "learner") return;
  try {
    feedbackRecords = await listMine("feedback", currentSession.localId);
    renderLearnerFeedback();
  } catch (error) {
    learnerFeedbackList.textContent = `Could not load feedback: ${friendlyError(error)}`;
  }
}

function renderLearnerFeedback() {
  learnerFeedbackList.replaceChildren();
  if (!feedbackRecords.length) {
    learnerFeedbackList.innerHTML = "<p>No feedback yet.</p>";
    return;
  }
  feedbackRecords.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).forEach((record) => {
    const entry = document.createElement("article");
    entry.className = `feedback-entry feedback-${record.status || "new"}`;
    const heading = document.createElement("div");
    heading.className = "feedback-entry-heading";
    const subject = document.createElement("strong");
    subject.textContent = `${record.subject || "General"}${record.workTitle ? ` · ${record.workTitle}` : ""}`;
    const status = document.createElement("span");
    status.className = "feedback-status";
    status.textContent = record.status === "discuss" ? "Discussion requested" : record.status === "read" ? "Reviewed" : "New";
    heading.append(subject, status);
    const body = document.createElement("p");
    body.textContent = record.message || "";
    const actions = document.createElement("div");
    actions.className = "feedback-entry-actions";
    if (!record.status || record.status === "new") {
      [["read", "Mark reviewed"], ["discuss", "Request discussion"]].forEach(([value, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", async () => {
          try {
            await update("feedback", record.id, { status: value, respondedAt: new Date().toISOString() });
            await loadLearnerFeedback();
          } catch (error) {
            setMessage(`Could not update feedback: ${friendlyError(error)}`);
          }
        });
        actions.appendChild(button);
      });
    }
    entry.append(heading, body, actions);
    learnerFeedbackList.appendChild(entry);
  });
}

async function loadAssessorFeedback() {
  if (currentRole !== "assessor") return;
  try {
    feedbackRecords = await listAll("feedback");
    renderAssessorFeedback();
    renderAssessorStats();
  } catch (error) {
    assessorFeedbackList.textContent = `Could not load feedback: ${friendlyError(error)}`;
  }
}

function renderAssessorFeedback() {
  assessorFeedbackList.replaceChildren();
  if (!feedbackRecords.length) {
    assessorFeedbackList.innerHTML = "<p>No feedback sent yet.</p>";
    return;
  }
  feedbackRecords.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).forEach((record) => {
    const entry = document.createElement("article");
    entry.className = "feedback-entry";
    const heading = document.createElement("div");
    heading.className = "feedback-entry-heading";
    const learner = document.createElement("strong");
    learner.textContent = record.studentEmail || "Learner";
    const status = document.createElement("span");
    status.className = "feedback-status";
    status.textContent = record.status === "discuss" ? "Discussion requested" : record.status === "read" ? "Reviewed" : "Awaiting learner";
    heading.append(learner, status);
    const details = document.createElement("p");
    details.textContent = `${record.subject || "General"}${record.workTitle ? ` · ${record.workTitle}` : ""}`;
    const body = document.createElement("p");
    body.textContent = record.message || "";
    entry.append(heading, details, body);
    assessorFeedbackList.appendChild(entry);
  });
}

assessorFeedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const studentEmail = byId("feedbackLearner").value.trim().toLowerCase();
  try {
    const matches = await listByField("users", "email", studentEmail);
    const learner = matches.find((user) => user.role !== "assessor");
    if (!learner) {
      byId("assessorFeedbackStatus").textContent = "No learner account was found for that email.";
      return;
    }
    await create("feedback", {
      userId: learner.id,
      studentEmail,
      subject: byId("feedbackSubject").value,
      workTitle: byId("feedbackWorkTitle").value.trim(),
      message: byId("feedbackMessage").value.trim(),
      status: "new",
      assessorId: currentSession.localId,
      createdAt: new Date().toISOString(),
    });
    assessorFeedbackForm.reset();
    byId("assessorFeedbackStatus").textContent = "Feedback sent. The learner can review it in their Feedback section.";
    await loadAssessorFeedback();
  } catch (error) {
    byId("assessorFeedbackStatus").textContent = `Could not send feedback: ${friendlyError(error)}`;
  }
});

const gameTopicSelect = byId("gameTopic");
const gameOptions = [...document.querySelectorAll(".answer-option")];
const gameBestKey = "skillShareGameBestScore";
byId("gameBestScore").textContent = localStorage.getItem(gameBestKey) || "0";

gameTopicSelect.addEventListener("change", () => startGameRound(false));
byId("nextQuestionBtn").addEventListener("click", () => {
  if (!gameQuestionAnswered) return;
  gameQuestionIndex += 1;
  if (gameQuestionIndex >= gameQuestions.length) finishGame();
  else renderGameQuestion();
});
byId("restartGameBtn").addEventListener("click", () => startGameRound(true));

function startGameRound(resetScore = true) {
  gameQuestions = topicQuestions[gameTopicSelect.value] || topicQuestions.html;
  gameQuestionIndex = 0;
  if (resetScore) gameScore = 0;
  byId("gameFeedback").textContent = "";
  byId("nextQuestionBtn").hidden = false;
  byId("restartGameBtn").hidden = true;
  renderGameQuestion();
}

function renderGameQuestion() {
  const question = gameQuestions[gameQuestionIndex];
  if (!question) return;
  gameQuestionAnswered = false;
  byId("question").textContent = question.question;
  byId("gameQuestionCount").textContent = `Question ${gameQuestionIndex + 1} of ${gameQuestions.length}`;
  byId("gameScore").textContent = String(gameScore);
  byId("gameFeedback").textContent = "";
  byId("nextQuestionBtn").disabled = true;
  byId("nextQuestionBtn").textContent = gameQuestionIndex === gameQuestions.length - 1 ? "Finish" : "Next Question";
  gameOptions.forEach((button, index) => {
    const answer = question.options[index];
    button.hidden = answer === undefined;
    button.disabled = false;
    button.classList.remove("correct", "incorrect");
    button.textContent = answer || "";
    button.onclick = () => {
      if (gameQuestionAnswered) return;
      gameQuestionAnswered = true;
      const correct = index === question.answer;
      if (correct) gameScore += 1;
      gameOptions.forEach((option, optionIndex) => {
        option.disabled = true;
        if (optionIndex === question.answer) option.classList.add("correct");
        else if (optionIndex === index) option.classList.add("incorrect");
      });
      byId("gameScore").textContent = String(gameScore);
      byId("gameFeedback").textContent = `${correct ? "Correct. " : "Not quite. "}${question.explanation}`;
      byId("nextQuestionBtn").disabled = false;
    };
  });
}

async function finishGame() {
  byId("question").textContent = `Game complete: ${gameScore} out of ${gameQuestions.length}`;
  gameOptions.forEach((button) => { button.hidden = true; });
  byId("gameFeedback").textContent = "Your result has been recorded.";
  byId("nextQuestionBtn").hidden = true;
  byId("restartGameBtn").hidden = false;
  const best = Math.max(gameScore, Number(localStorage.getItem(gameBestKey)) || 0);
  localStorage.setItem(gameBestKey, String(best));
  byId("gameBestScore").textContent = String(best);
  if (currentRole === "learner") {
    try {
      await create("scores", {
        userId: currentSession.localId,
        score: gameScore,
        total: gameQuestions.length,
        topic: gameTopicSelect.value,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      byId("gameFeedback").textContent = `Score: ${gameScore}. Could not save result: ${friendlyError(error)}`;
    }
  }
}

function showAuthFromHome() {
  showLogin();
}

async function startPortal() {
  renderResources();
  startGameRound();
  const session = getSession();
  if (!session) return;
  try {
    await enterPortal(session);
  } catch (error) {
    signOut();
    showHome();
    loginMessage.textContent = friendlyError(error);
    loginPage.hidden = false;
  }
}

startPortal();