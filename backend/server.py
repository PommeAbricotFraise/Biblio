from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import requests
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import io
import pandas as pd
from SPARQLWrapper import SPARQLWrapper, JSON as SPARQL_JSON


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Système de Gestion de Bibliothèque", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class Book(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    author: str
    edition: Optional[str] = ""
    isbn: Optional[str] = ""
    count: int = 1
    placard: str
    shelf: str
    category: Optional[str] = "Général"
    description: Optional[str] = ""
    status: str = "disponible"  # disponible, emprunté, perdu, en_maintenance
    date_added: datetime = Field(default_factory=datetime.utcnow)
    last_modified: datetime = Field(default_factory=datetime.utcnow)
    barcode: Optional[str] = ""
    language: Optional[str] = "fr"
    pages: Optional[int] = None
    publication_year: Optional[int] = None

class BookCreate(BaseModel):
    title: str
    author: str
    edition: Optional[str] = ""
    isbn: Optional[str] = ""
    count: int = 1
    placard: str
    shelf: str
    category: Optional[str] = "Général"
    description: Optional[str] = ""
    barcode: Optional[str] = ""
    language: Optional[str] = "fr"
    pages: Optional[int] = None
    publication_year: Optional[int] = None

class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    edition: Optional[str] = None
    isbn: Optional[str] = None
    count: Optional[int] = None
    placard: Optional[str] = None
    shelf: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    barcode: Optional[str] = None
    language: Optional[str] = None
    pages: Optional[int] = None
    publication_year: Optional[int] = None

class Placard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    location: Optional[str] = ""
    capacity: Optional[int] = None
    date_created: datetime = Field(default_factory=datetime.utcnow)

class PlacardCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    location: Optional[str] = ""
    capacity: Optional[int] = None

class Shelf(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    placard_name: str
    position: Optional[int] = None
    capacity: Optional[int] = None
    description: Optional[str] = ""
    date_created: datetime = Field(default_factory=datetime.utcnow)

class ShelfCreate(BaseModel):
    name: str
    placard_name: str
    position: Optional[int] = None
    capacity: Optional[int] = None
    description: Optional[str] = ""

class ISBNInfo(BaseModel):
    isbn: str
    title: Optional[str] = None
    authors: List[str] = []
    publisher: Optional[str] = None
    publication_date: Optional[str] = None
    page_count: Optional[int] = None
    description: Optional[str] = None
    language: Optional[str] = None
    categories: List[str] = []
    thumbnail: Optional[str] = None
    source: Optional[str] = None

class LibraryStats(BaseModel):
    total_books: int
    total_placards: int
    total_shelves: int
    books_by_category: Dict[str, int]
    books_by_status: Dict[str, int]
    books_by_placard: Dict[str, int]
    recent_additions: int
    top_authors: List[Dict[str, Any]]

# Status endpoint (keep for compatibility)
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


# Utility functions for ISBN lookup
def fetch_book_by_google_books(isbn: str) -> Optional[ISBNInfo]:
    """Fetch book information from Google Books API"""
    try:
        api_key = "AIzaSyCtmNBtpz28NH5S3hRoiQUGA9aOysZGQNM"  # Public demo key
        url = f"https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}&key={api_key}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('totalItems', 0) > 0:
                book = data['items'][0]['volumeInfo']
                return ISBNInfo(
                    isbn=isbn,
                    title=book.get('title'),
                    authors=book.get('authors', []),
                    publisher=book.get('publisher'),
                    publication_date=book.get('publishedDate'),
                    page_count=book.get('pageCount'),
                    description=book.get('description'),
                    language=book.get('language'),
                    categories=book.get('categories', []),
                    thumbnail=book.get('imageLinks', {}).get('thumbnail'),
                    source="Google Books"
                )
    except Exception as e:
        logging.error(f"Error fetching from Google Books: {e}")
    return None

def fetch_book_by_open_library(isbn: str) -> Optional[ISBNInfo]:
    """Fetch book information from Open Library API"""
    try:
        url = f"https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            book_key = f"ISBN:{isbn}"
            if book_key in data:
                book = data[book_key]
                return ISBNInfo(
                    isbn=isbn,
                    title=book.get('title'),
                    authors=[author['name'] for author in book.get('authors', [])],
                    publisher=', '.join([pub['name'] for pub in book.get('publishers', [])]),
                    publication_date=book.get('publish_date'),
                    page_count=book.get('number_of_pages'),
                    description=book.get('description', {}).get('value') if isinstance(book.get('description'), dict) else book.get('description'),
                    categories=book.get('subjects', [])[:5] if book.get('subjects') else [],
                    thumbnail=book.get('cover', {}).get('medium'),
                    source="Open Library"
                )
    except Exception as e:
        logging.error(f"Error fetching from Open Library: {e}")
    return None

async def load_initial_data():
    """Load initial data from JSON files if collections are empty"""
    try:
        # Check if data already exists
        if await db.books.count_documents({}) > 0:
            return
        
        # Load books
        books_file = Path("/app/original_files/books.json")
        if books_file.exists():
            with open(books_file, 'r', encoding='utf-8') as f:
                books_data = json.load(f)
            
            for book_data in books_data:
                book = Book(
                    title=book_data['title'],
                    author=book_data['author'],
                    edition=book_data.get('edition', ''),
                    count=int(book_data.get('count', 1)),
                    placard=book_data['placard'],
                    shelf=book_data['shelf'],
                    category="Littérature" if any(word in book_data['title'].lower() for word in ['fable', 'poème', 'conte']) else "Général"
                )
                await db.books.insert_one(book.dict())
        
        # Load placards
        placards_file = Path("/app/original_files/placards.json")
        if placards_file.exists():
            with open(placards_file, 'r', encoding='utf-8') as f:
                placards_data = json.load(f)
            
            for placard_name in placards_data:
                placard = Placard(name=placard_name, description=f"Placard {placard_name}")
                await db.placards.insert_one(placard.dict())
        
        # Load shelves
        shelves_file = Path("/app/original_files/shelves.json")
        if shelves_file.exists():
            with open(shelves_file, 'r', encoding='utf-8') as f:
                shelves_data = json.load(f)
            
            for shelf_name in shelves_data:
                shelf = Shelf(name=shelf_name, placard_name="A", position=int(shelf_name) if shelf_name.isdigit() else 1)
                await db.shelves.insert_one(shelf.dict())
        
        logging.info("Initial data loaded successfully")
    except Exception as e:
        logging.error(f"Error loading initial data: {e}")


# Basic endpoints
@api_router.get("/")
async def root():
    return {"message": "Système de Gestion de Bibliothèque - API v1.0.0"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
