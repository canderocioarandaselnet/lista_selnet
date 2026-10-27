SELECT
      NULLIF(LOWER(CAST(hik_code AS STRING)), 'nan') AS hik_code,
      NULLIF(UPPER(CAST(cod_bejerman AS STRING)), 'NAN') AS cod_bejerman,
      NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
      NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
      CAST(categoria AS STRING) AS categoria,
      CAST(subcategoria AS STRING) AS subcategoria
    FROM `selnet-476815.pagina.hikmicro`