# OR-Tools Solver Worker

Stateless FastAPI worker. It accepts only controlled route snapshots/policies, stores no business data, and enforces a 1–10 second solve bound.

```powershell
cd D:\openAI\dormitoryB\solver-worker
python -m pip install -r requirements.txt
python -m uvicorn app:app --port 8010
```

- `GET /health`
- `POST /solve`

Run `pytest -q` to verify health and exact-once stop inclusion.
