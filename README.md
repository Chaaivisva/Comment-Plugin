# 📝 Comment System

A **full-stack annotation system** built with **Django + Chrome Extension**.

---

## 📖 Introduction

This repository contains the source code for a **full-stack Comment System**, designed as a **Django backend** with a **Chrome Extension frontend**.

It allows users to:

- Select text on any webpage  
- Add comments linked to the selected text  
- View and collaborate with others in real time  

The system is resilient — using **text-based anchoring** so comments persist even if a webpage changes.  
The extension UI runs inside a **Shadow DOM** to prevent CSS conflicts with host websites.

---

## ✨ Key Features

- **Secure Authentication** — token-based API between extension & backend  
- **Robust Text Anchoring** — uses XPath, CSS selectors, and text offsets  
- **Conflict-Free UI** — UI injected inside Shadow DOM  
- **Full-Stack Solution** — Django backend + Chrome Extension frontend  
- **Collaborative Comments** — fetches & displays other users’ comments  
- **Responsive UI** — comment bubble and panel adapt to scrolling & layout  

---

## 🛠️ Technologies Used

### Backend (Django)
- **Django** — backend framework  
- **Django REST Framework (DRF)** — REST APIs for comments, auth, users  
- **Python** — backend language  
- *(Optional)* **SQLAlchemy** — for advanced DB handling  
- *(Optional)* **Pillow** — image processing  

### Frontend (Chrome Extension)
- **JavaScript (ES6+)** — content, popup, background scripts  
- **HTML / TailwindCSS** — responsive UI  
- **Chrome Extension APIs** — Manifest v3 features  
- **Shadow DOM** — UI isolation  

---

## Getting Started

### Prerequisites

- **Python 3.10+** — on Windows, tick *"Add python.exe to PATH"* in the installer
- **Git**
- **Google Chrome** (or another Chromium browser such as Edge or Brave)

### Repository layout

```
Comment-Plugin/
├── Backend_Comment_system/    # Django backend (run the server from here)
└── Frontend_Comment_system/   # Chrome extension (load this folder in Chrome)
```

### 1. Clone the repository

```bash
git clone https://github.com/Chaaivisva/Comment-Plugin.git
cd Comment-Plugin/Backend_Comment_system
```

### 2. Set up the backend

**Windows, the quick way:** double-click `Backend_Comment_system\setup.bat` once (it creates
the venv, installs dependencies, creates `.env` with a random `SECRET_KEY` and runs migrations),
then double-click `run.bat` whenever you want to start the server. Skip to step 5.

**Windows, manually (PowerShell or Command Prompt)**

```powershell
py -m venv venv
venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
```

> If `py` is not found, use `python` instead.
> If you prefer activating the venv in PowerShell (`venv\Scripts\Activate.ps1`) and get a
> *"running scripts is disabled"* error, run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or just use the
> `venv\Scripts\python` commands shown here, which need no activation.

**Linux / macOS**

```bash
python3 -m venv venv
venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
```

### 3. Configure `.env`

Open `Backend_Comment_system/.env` in any editor and set `SECRET_KEY` to a long random string.
You can generate one with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

The email settings are optional. If you leave them empty, notification emails are printed
to the server console instead of being sent.

### 4. Create the database and run the server

**Windows**

```powershell
venv\Scripts\python manage.py migrate
venv\Scripts\python manage.py createsuperuser
venv\Scripts\python manage.py runserver
```

**Linux / macOS**

```bash
venv/bin/python manage.py migrate
venv/bin/python manage.py createsuperuser
venv/bin/python manage.py runserver
```

The API is now available at `http://127.0.0.1:8000/api/`. Keep this terminal open while you
use the extension. The extension expects the server on exactly `127.0.0.1:8000`.

### 5. Load the Chrome extension

1. Open **Google Chrome**
2. Go to `chrome://extensions`
3. Turn on **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the **`Frontend_Comment_system`** folder
   (the one containing `manifest.json`, not the repository root)
5. The extension now appears in your toolbar. Click it to register or log in.

## Usage

1. Open any webpage  
2. Select text → a **comment bubble** appears  
3. Click the bubble → opens the **comment panel**  
4. Log in → add your comment → it gets stored in the backend  
5. Other users’ comments appear **in real time**  
