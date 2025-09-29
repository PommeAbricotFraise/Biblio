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
    description: Optional[str] = ""
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
    description: Optional[str] = None
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
    storage_type: Optional[str] = "placard"  # placard, bac, mur, etc.
    date_created: datetime = Field(default_factory=datetime.utcnow)

class PlacardCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    location: Optional[str] = ""
    capacity: Optional[int] = None
    storage_type: Optional[str] = "placard"

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
def fetch_book_by_bnf(isbn: str) -> Optional[ISBNInfo]:
    """Fetch book information from Bibliothèque nationale de France (BNF) using SPARQL"""
    try:
        sparql = SPARQLWrapper("http://data.bnf.fr/sparql")
        
        # Requête SPARQL pour rechercher un livre par ISBN
        query = f"""
        PREFIX dcterms: <http://purl.org/dc/terms/>
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX bnf-onto: <http://data.bnf.fr/ontology/bnf-onto/>
        
        SELECT DISTINCT ?title ?author ?publisher ?date WHERE {{
            ?book dcterms:identifier "{isbn}" ;
                  dcterms:title ?title .
            OPTIONAL {{ ?book dcterms:creator ?creatorUri . 
                       ?creatorUri foaf:name ?author }}
            OPTIONAL {{ ?book dcterms:publisher ?publisherUri .
                       ?publisherUri foaf:name ?publisher }}
            OPTIONAL {{ ?book dcterms:date ?date }}
        }}
        LIMIT 1
        """
        
        sparql.setQuery(query)
        sparql.setReturnFormat(SPARQL_JSON)
        
        results = sparql.query().convert()
        
        if results["results"]["bindings"]:
            result = results["results"]["bindings"][0]
            
            return ISBNInfo(
                isbn=isbn,
                title=result.get("title", {}).get("value"),
                authors=[result.get("author", {}).get("value")] if result.get("author") else [],
                publisher=result.get("publisher", {}).get("value"),
                publication_date=result.get("date", {}).get("value"),
                source="BNF (Bibliothèque nationale de France)"
            )
    except Exception as e:
        logging.error(f"Error fetching from BNF SPARQL: {e}")
    return None

def fetch_book_by_google_books(isbn: str) -> Optional[ISBNInfo]:
    """Fetch book information from Google Books API"""
    try:
        # Clé API publique de démonstration - vous pouvez la remplacer
        api_key = "AIzaSyCtmNBtpz28NH5S3hRoiQUGA9aOysZGQNM"
        url = f"https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}&key={api_key}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('totalItems', 0) > 0:
                book = data['items'][0]['volumeInfo']
                
                # Traitement sécurisé des catégories
                categories = []
                if book.get('categories'):
                    for category in book.get('categories', []):
                        if isinstance(category, str):
                            categories.append(category)
                        elif isinstance(category, dict) and 'name' in category:
                            categories.append(category['name'])
                
                return ISBNInfo(
                    isbn=isbn,
                    title=book.get('title'),
                    authors=book.get('authors', []),
                    publisher=book.get('publisher'),
                    publication_date=book.get('publishedDate'),
                    page_count=book.get('pageCount'),
                    description=book.get('description'),
                    language=book.get('language'),
                    categories=categories,
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
                
                # Traitement des catégories (subjects)
                categories = []
                if book.get('subjects'):
                    for subject in book.get('subjects', [])[:5]:  # Limiter à 5
                        if isinstance(subject, dict) and 'name' in subject:
                            categories.append(subject['name'])
                        elif isinstance(subject, str):
                            categories.append(subject)
                
                return ISBNInfo(
                    isbn=isbn,
                    title=book.get('title'),
                    authors=[author['name'] for author in book.get('authors', [])],
                    publisher=', '.join([pub['name'] for pub in book.get('publishers', [])]),
                    publication_date=book.get('publish_date'),
                    page_count=book.get('number_of_pages'),
                    description=book.get('description', {}).get('value') if isinstance(book.get('description'), dict) else book.get('description'),
                    categories=categories,
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
                    shelf=book_data['shelf']
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

# Books endpoints
@api_router.get("/books", response_model=List[Book])
async def get_books(
    skip: int = 0, 
    limit: int = 100,
    search: Optional[str] = Query(None),
    placard: Optional[str] = Query(None),
    shelf: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("title")
):
    """Get all books with optional filtering and sorting"""
    filter_query = {}
    
    if search:
        filter_query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"author": {"$regex": search, "$options": "i"}},
            {"isbn": {"$regex": search, "$options": "i"}}
        ]
    
    if placard:
        filter_query["placard"] = placard
    
    if shelf:
        filter_query["shelf"] = shelf
    
    sort_field = sort_by if sort_by in ["title", "author", "date_added", "last_modified"] else "title"
    
    books = await db.books.find(filter_query).sort(sort_field, 1).skip(skip).limit(limit).to_list(limit)
    return [Book(**book) for book in books]

@api_router.post("/books", response_model=Book)
async def create_book(book: BookCreate):
    """Create a new book"""
    book_dict = book.dict()
    book_obj = Book(**book_dict)
    await db.books.insert_one(book_obj.dict())
    return book_obj

@api_router.get("/books/{book_id}", response_model=Book)
async def get_book(book_id: str):
    """Get a specific book by ID"""
    book = await db.books.find_one({"id": book_id})
    if not book:
        raise HTTPException(status_code=404, detail="Livre non trouvé")
    return Book(**book)

@api_router.put("/books/{book_id}", response_model=Book)
async def update_book(book_id: str, book_update: BookUpdate):
    """Update a book"""
    update_data = {k: v for k, v in book_update.dict().items() if v is not None}
    update_data["last_modified"] = datetime.utcnow()
    
    result = await db.books.update_one({"id": book_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Livre non trouvé")
    
    book = await db.books.find_one({"id": book_id})
    return Book(**book)

@api_router.delete("/books/{book_id}")
async def delete_book(book_id: str):
    """Delete a book"""
    result = await db.books.delete_one({"id": book_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Livre non trouvé")
    return {"message": "Book deleted successfully"}

# Placard endpoints
@api_router.get("/placards", response_model=List[Placard])
async def get_placards():
    """Get all placards"""
    placards = await db.placards.find().to_list(1000)
    return [Placard(**placard) for placard in placards]

@api_router.post("/placards", response_model=Placard)
async def create_placard(placard: PlacardCreate):
    """Create a new placard"""
    placard_dict = placard.dict()
    placard_obj = Placard(**placard_dict)
    await db.placards.insert_one(placard_obj.dict())
    return placard_obj

@api_router.delete("/placards/{placard_id}")
async def delete_placard(placard_id: str):
    """Delete a placard and all its books"""
    placard = await db.placards.find_one({"id": placard_id})
    if not placard:
        raise HTTPException(status_code=404, detail="Placard non trouvé")
    
    # Delete all books in this placard
    await db.books.delete_many({"placard": placard["name"]})
    # Delete all shelves in this placard
    await db.shelves.delete_many({"placard_name": placard["name"]})
    # Delete the placard
    await db.placards.delete_one({"id": placard_id})
    
    return {"message": "Placard and all associated data deleted successfully"}

# Shelf endpoints
@api_router.get("/shelves", response_model=List[Shelf])
async def get_shelves(placard_name: Optional[str] = Query(None)):
    """Get all shelves, optionally filtered by placard"""
    filter_query = {}
    if placard_name:
        filter_query["placard_name"] = placard_name
    
    shelves = await db.shelves.find(filter_query).sort("position", 1).to_list(1000)
    return [Shelf(**shelf) for shelf in shelves]

@api_router.post("/shelves", response_model=Shelf)
async def create_shelf(shelf: ShelfCreate):
    """Create a new shelf"""
    shelf_dict = shelf.dict()
    shelf_obj = Shelf(**shelf_dict)
    await db.shelves.insert_one(shelf_obj.dict())
    return shelf_obj

@api_router.delete("/shelves/{shelf_id}")
async def delete_shelf(shelf_id: str):
    """Delete a shelf and all its books"""
    shelf = await db.shelves.find_one({"id": shelf_id})
    if not shelf:
        raise HTTPException(status_code=404, detail="Étagère non trouvée")
    
    # Delete all books on this shelf
    await db.books.delete_many({"shelf": shelf["name"], "placard": shelf["placard_name"]})
    # Delete the shelf
    await db.shelves.delete_one({"id": shelf_id})
    
    return {"message": "Shelf and all associated books deleted successfully"}

# ISBN lookup endpoints
@api_router.get("/isbn/{isbn}", response_model=ISBNInfo)
async def lookup_isbn(isbn: str):
    """Look up book information by ISBN using multiple sources"""
    # Essayer d'abord la BNF pour les livres français
    book_info = fetch_book_by_bnf(isbn)
    if book_info and book_info.title:
        return book_info
    
    # Puis Google Books qui a une bonne couverture
    book_info = fetch_book_by_google_books(isbn)
    if book_info and book_info.title:
        return book_info
    
    # Enfin Open Library en derniers recours
    book_info = fetch_book_by_open_library(isbn)
    if book_info and book_info.title:
        return book_info
    
    raise HTTPException(status_code=404, detail="Aucune information trouvée pour ce code-barres")

@api_router.post("/books/from-isbn/{isbn}", response_model=Book)
async def create_book_from_isbn(isbn: str, placard: str, shelf: str):
    """Create a book from ISBN lookup"""
    book_info = await lookup_isbn(isbn)
    
    book_create = BookCreate(
        title=book_info.title or "Titre inconnu",
        author=", ".join(book_info.authors) if book_info.authors else "Auteur inconnu",
        edition=book_info.publisher or "",
        isbn=isbn,
        placard=placard,
        shelf=shelf,
        description=book_info.description or "",
        pages=book_info.page_count,
        language=book_info.language or "fr"
    )
    
    return await create_book(book_create)

# Statistics endpoint
@api_router.get("/stats", response_model=LibraryStats)
async def get_library_stats():
    """Get library statistics"""
    total_books = await db.books.count_documents({})
    total_placards = await db.placards.count_documents({})
    total_shelves = await db.shelves.count_documents({})
    
    # Books by placard
    placard_pipeline = [
        {"$group": {"_id": "$placard", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    placard_results = await db.books.aggregate(placard_pipeline).to_list(None)
    books_by_placard = {item["_id"]: item["count"] for item in placard_results}
    
    # Recent additions (last 7 days)
    from datetime import timedelta
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_additions = await db.books.count_documents({"date_added": {"$gte": seven_days_ago}})
    
    # Top authors
    author_pipeline = [
        {"$group": {"_id": "$author", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    author_results = await db.books.aggregate(author_pipeline).to_list(None)
    top_authors = [{"author": item["_id"], "count": item["count"]} for item in author_results]
    
    return LibraryStats(
        total_books=total_books,
        total_placards=total_placards,
        total_shelves=total_shelves,
        books_by_placard=books_by_placard,
        recent_additions=recent_additions,
        top_authors=top_authors
    )

# Export endpoints
@api_router.get("/export/excel")
async def export_books_excel(
    placard: Optional[str] = Query(None),
    shelf: Optional[str] = Query(None)
):
    """Export books to Excel file"""
    filter_query = {}
    
    if placard:
        filter_query["placard"] = placard
    if shelf:
        filter_query["shelf"] = shelf
    
    books = await db.books.find(filter_query).sort("title", 1).to_list(None)
    
    # Convert to pandas DataFrame
    df_data = []
    for book in books:
        df_data.append({
            "Titre": book["title"],
            "Auteur": book["author"],
            "Edition": book["edition"],
            "ISBN": book.get("isbn", ""),
            "Placard": book["placard"],
            "Étagère": book["shelf"],
            "Nombre": book["count"],
            "Pages": book.get("pages", ""),
            "Année": book.get("publication_year", ""),
            "Langue": book.get("language", ""),
            "Date d'ajout": book["date_added"].strftime("%d/%m/%Y %H:%M") if "date_added" in book else "",
            "Description": book.get("description", "")
        })
    
    df = pd.DataFrame(df_data)
    
    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Mes Livres', index=False)
        
        # Add a summary sheet
        stats = await get_library_stats()
        summary_data = [
            ["📚 Total des livres", stats.total_books],
            ["🗄️ Total des placards", stats.total_placards],
            ["📋 Total des étagères", stats.total_shelves],
            ["", ""],
            ["📊 Livres par placard", ""],
        ]
        
        for placard, count in stats.books_by_placard.items():
            summary_data.append([f"  Placard {placard}", count])
        
        summary_data.extend([
            ["", ""],
            ["✍️ Auteurs populaires", ""],
        ])
        
        for author in stats.top_authors[:5]:
            summary_data.append([f"  {author['author']}", f"{author['count']} livre(s)"])
        
        summary_df = pd.DataFrame(summary_data, columns=["Information", "Valeur"])
        summary_df.to_excel(writer, sheet_name='Résumé', index=False)
    
    output.seek(0)
    
    # Generate filename with current date
    filename = f"ma_bibliotheque_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        io.BytesIO(output.read()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# Library visualization endpoint
@api_router.get("/visualization")
async def get_library_visualization():
    """Get data for library visualization"""
    placards = await db.placards.find().to_list(None)
    shelves = await db.shelves.find().sort("position", 1).to_list(None)
    books = await db.books.find().to_list(None)
    
    # Organize data for visualization
    visualization_data = {}
    
    for placard in placards:
        placard_name = placard["name"]
        visualization_data[placard_name] = {
            "info": {
                "id": str(placard["id"]),
                "name": placard["name"],
                "description": placard.get("description", ""),
                "location": placard.get("location", ""),
            },
            "shelves": {},
            "total_books": 0
        }
    
    # Add shelves to placards
    for shelf in shelves:
        placard_name = shelf["placard_name"]
        if placard_name in visualization_data:
            shelf_name = shelf["name"]
            visualization_data[placard_name]["shelves"][shelf_name] = {
                "info": {
                    "id": str(shelf["id"]),
                    "name": shelf["name"],
                    "placard_name": shelf["placard_name"],
                    "position": shelf.get("position"),
                    "capacity": shelf.get("capacity"),
                },
                "books": [],
                "book_count": 0
            }
    
    # Add books to shelves
    for book in books:
        placard_name = book["placard"]
        shelf_name = book["shelf"]
        
        if placard_name in visualization_data and shelf_name in visualization_data[placard_name]["shelves"]:
            book_data = {
                "id": str(book["id"]),
                "title": book["title"],
                "author": book["author"],
                "count": book["count"]
            }
            visualization_data[placard_name]["shelves"][shelf_name]["books"].append(book_data)
            visualization_data[placard_name]["shelves"][shelf_name]["book_count"] += book["count"]
            visualization_data[placard_name]["total_books"] += book["count"]
    
    return visualization_data

# Barcode Scanner Endpoint
class BarcodeRequest(BaseModel):
    barcode: str
    placard: str
    shelf: str

@api_router.post("/barcode/scan")
async def scan_barcode(request: BarcodeRequest):
    """
    Process a scanned barcode and try to find book info via ISBN lookup
    """
    barcode = request.barcode.strip()
    
    # Try to treat barcode as ISBN
    book_info = await lookup_isbn(barcode)
    if not book_info:
        raise HTTPException(status_code=404, detail="Aucune information trouvée pour ce code-barres")
    
    # Return the book info with suggested placement
    return {
        "book_info": book_info,
        "suggested_placement": {
            "placard": request.placard,
            "shelf": request.shelf
        },
        "message": f"Livre trouvé ! Vous pouvez maintenant l'ajouter à votre bibliothèque."
    }

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

@app.on_event("startup")
async def startup_event():
    """Initialize database with default data"""
    await load_initial_data()
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Application shutdown")
