import os
import json
from google.cloud import bigquery

sa_path = os.path.join(os.path.dirname(__file__), "service_account.json")
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = sa_path
client = bigquery.Client(project="selnet-476815")

query = "SELECT mail, categoria, fecha_registro, creado_por FROM `selnet-476815.pagina.accesos`"
rows = list(client.query(query).result())

user_dict = {}
for r in rows:
    email = (r["mail"] or "").strip().lower()
    cat = (r["categoria"] or "").strip().lower()
    if not email:
        continue
    if email not in user_dict:
        user_dict[email] = {
            "email": email,
            "niveles": set(),
            "notas": []
        }
    
    # Manejo de categorías
    if cat in ["gold", "ruby", "platinum", "black", "diamond", "interna"]:
        user_dict[email]["niveles"].add(cat)
    elif cat in ["ezviz", "vivotek"]:
        user_dict[email]["notas"].append(f"acceso_{cat}")
        # Si no tenía nivel base, le asignamos gold
        if not any(t in user_dict[email]["niveles"] for t in ["gold", "ruby", "platinum", "black", "diamond", "interna"]):
            user_dict[email]["niveles"].add("gold")

# Tratamiento especial para administradores y equipo Selnet
ADMIN_EMAILS = [
    "canderocioaranda.selnet@gmail.com",
    "mhmolesini@gmail.com"
]

ALL_TIERS = ["gold", "ruby", "platinum", "black", "diamond", "interna"]

records = []
for email, data in user_dict.items():
    niveles = sorted(list(data["niveles"]))
    if not niveles:
        niveles = ["gold"]
    
    # Si es admin o interna
    rol = "admin" if email in ADMIN_EMAILS else "cliente"
    if email in ADMIN_EMAILS or "interna" in niveles:
        niveles = ALL_TIERS

    notas = ", ".join(data["notas"]) if data["notas"] else None

    records.append({
        "email": email,
        "niveles": niveles,
        "rol": rol,
        "estado": "activo",
        "notas": notas
    })

print(f"Total registros únicos listos para Supabase: {len(records)}")

# Escribir a un archivo SQL con INSERTs
sql_inserts = []
for r in records:
    niveles_pg = "ARRAY[" + ", ".join([f"'{n}'" for n in r["niveles"]]) + "]::TEXT[]"
    notas_val = f"'{r['notas']}'" if r["notas"] else "NULL"
    sql_inserts.append(
        f"INSERT INTO public.accesos_precargados (email, niveles, rol, estado, notas) "
        f"VALUES ('{r['email']}', {niveles_pg}, '{r['rol']}', '{r['estado']}', {notas_val}) "
        f"ON CONFLICT (email) DO UPDATE SET niveles = EXCLUDED.niveles, rol = EXCLUDED.rol, estado = EXCLUDED.estado;"
    )

output_sql_path = os.path.join(os.path.dirname(__file__), "..", "database", "supabase", "03_auth_and_access_management.sql")
with open(output_sql_path, "a", encoding="utf-8") as f:
    f.write("\n\n-- ==============================================================================\n")
    f.write(f"-- 8. Precarga de los {len(records)} accesos migrados desde BigQuery\n")
    f.write("-- ==============================================================================\n\n")
    f.write("\n".join(sql_inserts))
    f.write("\n")

print(f"SQL generado y anexado exitosamente en: {output_sql_path}")
