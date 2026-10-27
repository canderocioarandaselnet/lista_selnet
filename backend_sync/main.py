import os
import time
from datetime import datetime
from google.cloud import bigquery
from supabase import create_client, Client
from dotenv import load_dotenv

# Cargar variables de entorno si corre en local
load_dotenv()

GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "selnet-476815")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BQ_VIEW_NAME = os.getenv("BQ_VIEW_NAME", f"{GCP_PROJECT_ID}.pagina.v_catalogo_maestro")

def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def safe_float(val):
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

def safe_int(val, default=0):
    if val is None or val == "":
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default

def sync_catalogo_bq_to_supabase():
    """
    Función principal de sincronización:
    1. Lee la vista canónica de BigQuery.
    2. Convierte y valida tipos.
    3. Hace Upsert en lotes a Supabase.
    4. Registra métricas en la tabla sync_logs.
    """
    start_time = time.time()
    supabase = get_supabase_client()
    bq_client = bigquery.Client(project=GCP_PROJECT_ID)

    print(f"[{datetime.now().isoformat()}] 🚀 Iniciando sincronización BQ -> Supabase...")
    print(f"📖 Leyendo vista: {BQ_VIEW_NAME}")

    query = f"SELECT * FROM `{BQ_VIEW_NAME}`"
    
    try:
        query_job = bq_client.query(query)
        rows = list(query_job.result())
        total_rows = len(rows)
        print(f"📊 {total_rows} registros leídos desde BigQuery.")

        if total_rows == 0:
            print("⚠️ No se encontraron registros para sincronizar.")
            return {"status": "EMPTY", "rows": 0}

        # Formateo de registros para Supabase
        productos = []
        for r in rows:
            prod = {
                "sap": str(r.get("sap")) if r.get("sap") else None,
                "cod_bejerman": str(r.get("cod_bejerman")).strip().upper() if r.get("cod_bejerman") else None,
                "modelo": str(r.get("modelo") or "").strip(),
                "descripcion": str(r.get("descripcion") or "").strip() if r.get("descripcion") else None,
                "marca": str(r.get("marca") or "SIN MARCA").strip().upper(),
                "categoria": str(r.get("categoria") or "").strip().upper() if r.get("categoria") else None,
                "subcategoria": str(r.get("subcategoria") or "").strip().upper() if r.get("subcategoria") else None,
                
                # Precios
                "precio_diamond": safe_float(r.get("precio_diamond")),
                "precio_black": safe_float(r.get("precio_black")),
                "precio_platinum": safe_float(r.get("precio_platinum")),
                "precio_ruby": safe_float(r.get("precio_ruby")),
                "precio_gold": safe_float(r.get("precio_gold")),
                "pvp": safe_float(r.get("pvp")),
                "epp": safe_float(r.get("epp")),
                "iva": safe_float(r.get("iva")),

                # Stock y Tránsito
                "stock": safe_int(r.get("stock"), 0),
                "en_transito": bool(r.get("en_transito")),

                # Banderas
                "es_oferta": str(r.get("es_oferta") or "").strip() if r.get("es_oferta") else None,
                "oferta_txt": str(r.get("oferta_txt") or "").strip() if r.get("oferta_txt") else None,
                "es_nuevo": bool(r.get("es_nuevo")),
                "es_interno": bool(r.get("es_interno")),

                "sincronizado_el": datetime.utcnow().isoformat()
            }
            # Clave obligatoria
            if prod["modelo"]:
                productos.append(prod)

        # Upsert en Supabase por lotes de 1.000 filas
        BATCH_SIZE = 1000
        upserted_count = 0
        for i in range(0, len(productos), BATCH_SIZE):
            batch = productos[i : i + BATCH_SIZE]
            res = supabase.table("productos").upsert(
                batch,
                on_conflict="marca,modelo"
            ).execute()
            upserted_count += len(batch)
            print(f"  💾 Lote {i // BATCH_SIZE + 1} procesado: {upserted_count}/{len(productos)} productos.")

        duracion_ms = int((time.time() - start_time) * 1000)

        # Registrar log exitoso en Supabase
        supabase.table("sync_logs").insert({
            "origen": "bigquery_view",
            "registros_insertados": upserted_count,
            "duracion_ms": duracion_ms,
            "estado": "SUCCESS"
        }).execute()

        print(f"✅ Sincronización completada con éxito en {duracion_ms / 1000:.2f} segundos.")
        return {"status": "SUCCESS", "rows": upserted_count, "duration_ms": duracion_ms}

    except Exception as e:
        duracion_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)
        print(f"❌ ERROR durante la sincronización: {error_msg}")
        
        try:
            supabase.table("sync_logs").insert({
                "origen": "bigquery_view",
                "duracion_ms": duracion_ms,
                "estado": "ERROR",
                "mensaje_error": error_msg
            }).execute()
        except Exception:
            pass

        raise e

# Handler para Cloud Function HTTP / Webhook
def sync_http_handler(request):
    """Punto de entrada para Google Cloud Function HTTP trigger"""
    try:
        result = sync_catalogo_bq_to_supabase()
        return ({"ok": True, "result": result}, 200, {"Content-Type": "application/json"})
    except Exception as e:
        return ({"ok": False, "error": str(e)}, 500, {"Content-Type": "application/json"})

# Handler para Cloud Function Pub/Sub
def sync_pubsub_handler(event, context):
    """Punto de entrada para Google Cloud Function suscrita a Pub/Sub"""
    sync_catalogo_bq_to_supabase()

if __name__ == "__main__":
    # Ejecución directa CLI
    sync_catalogo_bq_to_supabase()
