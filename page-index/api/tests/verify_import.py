import sys
import os

# Add root to python path
sys.path.append(os.getcwd())

try:
    from api.main import app
    print("SUCCESS: FastAPI app imported successfully")
except ImportError as e:
    print(f"FAILED: ImportError - {e}")
    sys.exit(1)
except Exception as e:
    print(f"FAILED: Exception - {e}")
    sys.exit(1)
