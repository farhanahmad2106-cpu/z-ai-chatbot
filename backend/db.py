from fastapi import Request

async def get_database(request: Request):
    """
    FastAPI dependency that returns the MongoDB database instance attached to app.state.
    Ensures safe, non-global access to the database.
    """
    return request.app.state.db

async def get_foods_collection(request: Request):
    return request.app.state.db["foods"]

async def get_users_collection(request: Request):
    return request.app.state.db["users"]

async def get_system_logs_collection(request: Request):
    return request.app.state.db["system_logs"]