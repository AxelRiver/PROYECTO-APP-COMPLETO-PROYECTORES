import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add JSON body parser
  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Explicitly serve manifest.json and sw.js with correct headers
  app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(process.cwd(), 'public', 'manifest.json'));
  });

  app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(process.cwd(), 'public', 'sw.js'));
  });

  // Proxy for external icons to avoid CORS issues in PWA
  app.get("/icons/:size/settings.png", (req, res) => {
    const size = req.params.size;
    // console.log(`Icon proxy request: size=${size}`);
    
    // Use a more reliable icon source for all sizes
    // img.icons8.com is very stable and supports multiple sizes
    const url = `https://img.icons8.com/color/${size}/settings.png`;
    
    function fetchWithRedirects(targetUrl: string, depth = 0) {
      if (depth > 5) {
        // console.error(`Icon proxy: Too many redirects for ${targetUrl}`);
        res.status(500).send('Too many redirects');
        return;
      }

      // console.log(`Icon proxy: Fetching ${targetUrl} (depth=${depth})`);
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };

      https.get(targetUrl, options, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          let location = response.headers.location;
          if (!location) {
            // console.error('Icon proxy: Redirect without location header');
            res.status(500).send('Redirect error');
            return;
          }

          // Handle relative redirects
          if (location.startsWith('/')) {
            const parsedUrl = new URL(targetUrl);
            location = `${parsedUrl.protocol}//${parsedUrl.host}${location}`;
          }

          // console.log(`Icon proxy: Redirecting to ${location}`);
          fetchWithRedirects(location, depth + 1);
          return;
        }

        if (response.statusCode !== 200) {
          // console.warn(`Icon proxy: Received status ${response.statusCode} for ${targetUrl}`);
          // Fallback to a generic icon if the specific size fails
          if (targetUrl !== `https://img.icons8.com/color/512/settings.png`) {
            // console.log('Icon proxy: Attempting fallback to 512px icon');
            fetchWithRedirects(`https://img.icons8.com/color/512/settings.png`, depth + 1);
            return;
          }
          res.status(response.statusCode || 500).send('Icon not available');
          return;
        }

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        response.pipe(res);
      }).on('error', (err) => {
        // console.error('Proxy error:', err);
        res.status(500).send('Error fetching icon');
      });
    }

    fetchWithRedirects(url);
  });

  // Explicitly serve PWA files with correct MIME types
  app.get("/manifest.json", (req, res) => {
    // console.log(`Manifest requested: ${req.url}`);
    const filePath = process.env.NODE_ENV === "production" 
      ? path.join(process.cwd(), "dist", "manifest.json")
      : path.join(process.cwd(), "public", "manifest.json");
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(filePath);
  });

  app.get("/sw.js", (req, res) => {
    // console.log(`Service Worker requested: ${req.url}`);
    const filePath = process.env.NODE_ENV === "production"
      ? path.join(process.cwd(), "dist", "sw.js")
      : path.join(process.cwd(), "public", "sw.js");
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(filePath);
  });

  app.post("/api/notify-login", async (req, res) => {
    // console.log(`Login notification request for: ${req.body.email}`);
    const { email, device, location, time } = req.body;
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      // console.log('RESEND_API_KEY not found, skipping email notification');
      return res.json({ success: true, message: "Email service not configured, skipping" });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      // console.log('Invalid or missing email in notify-login request');
      return res.status(400).json({ error: "Invalid email address" });
    }

    try {
      // console.log('Importing Resend...');
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);

      const cleanEmail = email.trim().toLowerCase();
      // console.log(`Sending email to: ${cleanEmail}`);
      
      // Use an array for 'to' as it's more robust in some Resend versions
      // Also ensure all fields are present and strings
      const { data, error } = await resend.emails.send({
        from: 'Proyectores Pro <onboarding@resend.dev>',
        to: cleanEmail,
        subject: 'Notificación de Acceso - Proyectores Pro',
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
            <h2 style="color: #4f46e5; margin-top: 0;">Hola,</h2>
            <p>Se detectó un nuevo inicio de sesión en tu cuenta de <strong>Proyectores Pro</strong>.</p>
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #e2e8f0;">
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px;">
                <li style="margin-bottom: 8px;"><strong>Dispositivo:</strong> ${String(device || 'Desconocido')}</li>
                <li style="margin-bottom: 8px;"><strong>Ubicación:</strong> ${String(location || 'Desconocida')}</li>
                <li><strong>Hora:</strong> ${String(time || new Date().toLocaleString())}</li>
              </ul>
            </div>
            <p style="font-size: 13px; color: #64748b;">Si no fuiste tú, por favor contacta al administrador de inmediato para proteger tu cuenta.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="font-size: 11px; color: #94a3b8; text-align: center;">Este es un mensaje automático, por favor no respondas.</p>
          </div>
        `
      });

      if (error) {
        // console.warn('Resend API returned an error:', JSON.stringify(error, null, 2));
        
        // Handle common validation errors (like sandbox limitations)
        if (error.name === 'validation_error' || (error as any).message?.toLowerCase().includes('sandbox')) {
          return res.json({ 
            success: false, 
            message: "Email skipped due to Resend Sandbox limitations. You can only send emails to the address you used to sign up for Resend unless you verify your domain.",
            details: error
          });
        }
        
        return res.status(400).json({ error: "Error en el servicio de correo", details: error });
      }

      // console.log('Email sent successfully');
      res.json({ success: true, data });
    } catch (err: any) {
      // console.error('Internal server error in notify-login:', err);
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    // console.log('Starting Vite in development mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // console.log('Serving static files in production mode...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    // console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
