# El Confesionario del Sprint

Retrospectiva en tiempo real con temática de confesionario. Usa Supabase (plan Free): base de datos, login anónimo y tiempo real.

## Configuración (una sola vez)

1. Crea una cuenta en https://supabase.com y un proyecto nuevo (plan Free).
2. **Authentication > Sign In / Providers**: activa **Allow anonymous sign-ins** y guarda.
3. **SQL Editor > New query**: pega todo `supabase.sql` y pulsa **Run**. Crea las tablas, las reglas de seguridad y el tiempo real.
4. **Project Settings > API Keys**: copia la **Project URL** y la clave pública (**anon** o **publishable**) en `supabase-config.js`. Nunca uses la clave `service_role`.

## Ejecutar

Los módulos ES no funcionan abriendo el archivo con doble clic. Sirve la carpeta con el servidor incluido:

```powershell
powershell -ExecutionPolicy Bypass -File .\servir.ps1
```

Abre http://localhost:5500. Para que el equipo entre desde sus celulares, publica la carpeta en un hosting estático (Netlify Drop, GitHub Pages, etc.).

## Dinámica sugerida

1. El Padre (facilitador) abre un confesionario y proyecta la pantalla con el código.
2. Cada feligrés entra con el código y confiesa en secreto: pecados, milagros o plegarias.
3. El Padre abre los sobres uno por uno. Suena la campana en todos los dispositivos.
4. El equipo vota Amén. El Padre impone una penitencia (acción) y absuelve.
5. Al final, el Padre exporta el acta en Markdown.

## Notas

- Supabase limita los logins anónimos a 30 por hora por IP de forma predeterminada. En una oficina todos comparten IP; si el equipo es grande, súbelo en **Authentication > Rate Limits**.
- Un proyecto Free se pausa tras una semana sin uso; se reactiva desde el panel sin perder datos.
