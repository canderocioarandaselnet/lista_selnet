WITH base AS (
  SELECT
    NULLIF(LOWER(CAST(hik_code AS STRING)), 'nan') AS hik_code,
    NULLIF(UPPER(CAST(cod_bejerman AS STRING)), 'NAN') AS cod_bejerman,
    NULLIF(LOWER(CAST(nomenclatura_oficial AS STRING)), 'nan') AS nomenclatura_oficial,
    NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
    NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
    CAST(categoria AS STRING) AS categoria,
    CAST(subcategoria AS STRING) AS subcategoria,
    ROUND(SAFE_CAST(gremio AS FLOAT64), 2) AS gremio,
    ROUND(SAFE_CAST(epp AS FLOAT64), 2) AS epp,

    -- clave normalizada para cruces
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej
  FROM `selnet-476815.pagina.ezviz`
),

stock AS (
  SELECT
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(Codigo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej,
    SUM(SAFE_CAST(Disponible AS INT64)) AS disponible
  FROM `selnet-476815.pagina.stock_ultima_actualizacion`
  WHERE Codigo IS NOT NULL AND LOWER(CAST(Codigo AS STRING)) NOT IN ('nan', 'null', '')
  GROUP BY 1
),

transito AS (
  SELECT
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(bejerman AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej,
    SUM(SAFE_CAST(total_en_transito AS FLOAT64)) AS total_en_transito
  FROM `selnet-476815.pagina.en_transito`
  WHERE bejerman IS NOT NULL AND LOWER(CAST(bejerman AS STRING)) NOT IN ('nan', 'null', '')
  GROUP BY 1
),

ofertas_cte AS (
  SELECT 
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej,
    ARRAY_TO_STRING([
      IF(SAFE_CAST(gold AS FLOAT64) > 0, 'gold', NULL),
      IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
      IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
    ], ',') AS es_oferta,
    oferta
  FROM `selnet-476815.pagina.ofertas`
  WHERE cod_bejerman IS NOT NULL AND LOWER(CAST(cod_bejerman AS STRING)) NOT IN ('nan', 'null', '')
)

SELECT
  b.hik_code,
  b.cod_bejerman,
  b.nomenclatura_oficial,
  b.modelo,
  b.descripcion,
  b.categoria,
  b.subcategoria,
  b.gremio,
  b.epp,

  COALESCE(s.disponible, 0) AS disponible,

  IF(COALESCE(t.total_en_transito, 0) > 0, "Si", "No") AS en_transito,
  o.oferta,
  COALESCE(o.es_oferta, '') AS es_oferta

FROM base b
LEFT JOIN stock s
  ON b.key_bej IS NOT NULL AND b.key_bej = s.key_bej
LEFT JOIN transito t
  ON b.key_bej IS NOT NULL AND b.key_bej = t.key_bej
LEFT JOIN ofertas_cte o
  ON b.key_bej IS NOT NULL AND b.key_bej = o.key_bej

ORDER BY b.modelo