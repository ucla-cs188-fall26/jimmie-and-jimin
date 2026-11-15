import os
from pathlib import Path

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parent / ".env")

with MongoClient(
    f"mongodb+srv://{os.environ['MONGO_HOST']}/",
    username=os.environ["MONGO_USER"],
    password=os.environ["MONGO_PASSWORD"],
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=10000,
) as client:
    client.admin.command("ping")
    print("Connected to MongoDB!")