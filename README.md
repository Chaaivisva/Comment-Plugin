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

### Clone the Repository
```bash
git clone https://github.com/Chaaivisva/Comment-Plugin.git
cd Comment-Plugin
python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

pip install -r requirements.txt

SECRET_KEY='your_strong_secret_key_here'
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost
DATABASE_URL=sqlite:///db.sqlite3

python manage.py makemigrations
python manage.py migrate

python manage.py createsuperuser
python manage.py runserver
```

### **Set Up the Chrome Extension**

```markdown
## Set Up the Chrome Extension

1. Open **Google Chrome**  
2. Navigate to: `chrome://extensions`  
3. Enable **Developer Mode** (top-right toggle)  
4. Click **Load unpacked** → select the `plugin/` folder  
5. The extension will now appear in your browser
```
## Usage

1. Open any webpage  
2. Select text → a **comment bubble** appears  
3. Click the bubble → opens the **comment panel**  
4. Log in → add your comment → it gets stored in the backend  
5. Other users’ comments appear **in real time**  
