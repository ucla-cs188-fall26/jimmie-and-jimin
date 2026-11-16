# Gather

Gather helps a group of friends find a time to meet. Sign in with Google, create an event, share the invite link, and Gather suggests the best times.

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` and fill it in using `backend/.env.example` as a guide. Then:

```bash
python manage.py migrate
python manage.py runserver
```

### 2. Frontend (in a second terminal)

```bash
cd scheduling-frontend
npm install
npm run dev
```
