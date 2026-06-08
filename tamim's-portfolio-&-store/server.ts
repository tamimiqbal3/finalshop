import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db_store.json");

app.use(express.json({ limit: "50mb" }));

// Define initial base seeding structure
const initialData = {
  users: [
    {
      id: "admin_iqbal",
      name: "Admin Iqbal",
      email: "admin@tamimiqbal.com",
      pass: "7VolkJ00",
      isAdmin: true,
      restricted: false
    }
  ],
  products: [
    {
      id: "p1",
      name: "Tamim's Tech Setup Guide",
      price: 49.99,
      description: "A comprehensive guide to building a professional tech setup for AI research and development.",
      imageUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80"
    },
    {
      id: "p2",
      name: "AI Researcher Notebook",
      price: 19.99,
      description: "Premium notebook for brainstorming AI architectures.",
      imageUrl: "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=600&q=80"
    }
  ],
  courses: [
    {
      id: "c1",
      title: "Intro to AI Research",
      price: 149.99,
      description: "Learn the fundamentals of artificial intelligence research from deep learning to practical implementation.",
      syllabus: "Week 1: Basics, Week 2: Deep Learning, Week 3: Model Training",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      rating: 4.8,
      imageUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=600&q=80",
      benefits: [
        "Lifetime access to materials",
        "Direct mentorship support",
        "Real-world project building",
        "Certificate of completion"
      ],
      videos: []
    },
    {
      id: "c2",
      title: "Entrepreneurship Masterclass",
      price: 199.99,
      description: "How to organize events and build startups.",
      syllabus: "Week 1: Idea Generation, Week 2: Planning, Week 3: Execution",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      rating: 4.9,
      imageUrl: "https://images.unsplash.com/photo-1556761175-5973e21e51be?auto=format&fit=crop&w=600&q=80",
      benefits: [
        "Lifetime access to materials",
        "Investor pitch strategies",
        "Case studies breakdown"
      ],
      videos: []
    }
  ],
  orders: [],
  promoCodes: [
    { id: "promo1", code: "TAMIM10", type: "percent", value: 10, applicability: "all", targetIds: [] }
  ],
  contactMessages: [],
  settings: {
    googleSheetUrl: "",
    googleSheetSyncEnabled: false,
    syncLog: []
  }
};

// In-memory cache of database
let cacheDB: any = null;

// Helper to sanitize database output
function sanitizeDB(loaded: any) {
  return {
    users: Array.isArray(loaded.users) ? loaded.users : initialData.users,
    products: Array.isArray(loaded.products) ? loaded.products : initialData.products,
    courses: Array.isArray(loaded.courses) ? loaded.courses : initialData.courses,
    orders: Array.isArray(loaded.orders) ? loaded.orders : [],
    promoCodes: Array.isArray(loaded.promoCodes) ? loaded.promoCodes : initialData.promoCodes,
    contactMessages: Array.isArray(loaded.contactMessages) ? loaded.contactMessages : [],
    settings: loaded.settings || initialData.settings
  };
}

// Load or Seed DB Helper
function loadDB() {
  if (cacheDB) {
    return cacheDB;
  }

  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const loaded = JSON.parse(content);
      cacheDB = sanitizeDB(loaded);
      return cacheDB;
    }
  } catch (error) {
    console.error("Error reading database file, resetting to initialData:", error);
  }

  cacheDB = JSON.parse(JSON.stringify(initialData));
  saveLocalDBFile(cacheDB);
  return cacheDB;
}

function saveLocalDBFile(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing to local database file:", err);
  }
}

// Save DB Helper - Synchronously caches and writes local file database
function saveDB(data: any) {
  cacheDB = sanitizeDB(data);
  saveLocalDBFile(cacheDB);
}

// Background asynchronous Google Sheet syncing upon signup
async function postUserToGoogleSheets(user: any, sheetUrl: string) {
  try {
    const payload = {
      action: "signup",
      id: user.id,
      name: user.name,
      email: user.email,
      pass: user.pass,
      role: user.isAdmin ? "Admin" : "Customer",
      timestamp: new Date().toISOString()
    };
    
    console.log(`[Google Sheets] Synchronizing ${user.email} to spreadsheet...`);
    const response = await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const text = await response.text();
    console.log(`[Google Sheets] Broadcast outcome:`, text);
    
    const db = loadDB();
    if (!db.settings) {
      db.settings = { ...initialData.settings };
    }
    if (!db.settings.syncLog) {
      db.settings.syncLog = [];
    }
    db.settings.syncLog.unshift({
      id: Date.now().toString(),
      email: user.email,
      status: "Success",
      message: "Data successfully posted to Google Sheets endpoint.",
      time: new Date().toISOString()
    });
    db.settings.syncLog = db.settings.syncLog.slice(0, 20);
    saveDB(db);
  } catch (err: any) {
    console.error(`[Google Sheets] Broadcast error:`, err.message);
    const db = loadDB();
    if (!db.settings) {
      db.settings = { ...initialData.settings };
    }
    if (!db.settings.syncLog) {
      db.settings.syncLog = [];
    }
    db.settings.syncLog.unshift({
      id: Date.now().toString(),
      email: user.email,
      status: "Failed",
      message: `Failed to post data: ${err.message}`,
      time: new Date().toISOString()
    });
    db.settings.syncLog = db.settings.syncLog.slice(0, 20);
    saveDB(db);
  }
}

// ----------------------------------------
// API ENDPOINTS
// ----------------------------------------

// Unified status endpoint
app.get("/api/data", (req, res) => {
  const db = loadDB();
  res.json(db);
});

// Get Google Sheets / custom database settings
app.get("/api/settings", (req, res) => {
  const db = loadDB();
  res.json(db.settings || { googleSheetUrl: "", googleSheetSyncEnabled: false, syncLog: [] });
});

// Update Google Sheets / custom database settings
app.post("/api/settings", (req, res) => {
  const db = loadDB();
  const { googleSheetUrl, googleSheetSyncEnabled } = req.body;
  db.settings = {
    googleSheetUrl: googleSheetUrl || "",
    googleSheetSyncEnabled: !!googleSheetSyncEnabled,
    syncLog: (db.settings && db.settings.syncLog) || []
  };
  saveDB(db);
  res.json(db.settings);
});

// User signup
app.post("/api/users/signup", (req, res) => {
  const db = loadDB();
  const { name, email, pass, isAdmin } = req.body;
  
  if (!name || !email || !pass) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (db.users.find((u: any) => u && typeof u.email === "string" && u.email.toLowerCase().trim() === email.toLowerCase().trim())) {
    return res.status(400).json({ error: "Email already exists" });
  }

  const newUser = {
    id: Date.now().toString(),
    name,
    email,
    pass,
    isAdmin: email.toLowerCase().trim() === "admin@tamimiqbal.com" || (typeof isAdmin === "boolean" ? isAdmin : false),
    restricted: false
  };

  db.users.push(newUser);
  saveDB(db);

  // Trigger Google Sheet sync asynchronously if enabled
  if (db.settings && db.settings.googleSheetSyncEnabled && db.settings.googleSheetUrl) {
    postUserToGoogleSheets(newUser, db.settings.googleSheetUrl);
  }

  res.json(newUser);
});

// Memory store for login block tracking
// Key: email (lowercased), Value: { attempts: number, lockTime: number }
const loginAttempts = new Map<string, { attempts: number; lockTime: number }>();

// User login check with 3-minute block after 3 failed attempts and restriction check
app.post("/api/users/login", (req, res) => {
  const db = loadDB();
  const { email, pass } = req.body;
  const emailKey = String(email || "").toLowerCase().trim();
  const now = Date.now();

  // Check lockout block
  const attemptInfo = loginAttempts.get(emailKey);
  if (attemptInfo && attemptInfo.attempts >= 3 && now < attemptInfo.lockTime) {
    const remainingSecs = Math.ceil((attemptInfo.lockTime - now) / 1000);
    const mins = Math.floor(remainingSecs / 60);
    const secs = remainingSecs % 60;
    return res.status(403).json({ 
      error: `Too many failed attempts! Account blocked. Please try again in ${mins}m ${secs}s.` 
    });
  }

  // 1. Check special Admin credentials (not stored in DB, strictly kept on backend to prevent de-compilation hacks)
  if (emailKey === "admin@tamimiqbal.com") {
    if (pass === "7VolkJ00") {
      loginAttempts.delete(emailKey);
      
      // Return admin user session
      const adminUser = {
        id: "admin_iqbal",
        name: "Admin Iqbal",
        email: "admin@tamimiqbal.com",
        isAdmin: true,
        restricted: false
      };
      return res.json(adminUser);
    } else {
      // Record failed attempt
      let info = loginAttempts.get(emailKey) || { attempts: 0, lockTime: 0 };
      info.attempts += 1;
      if (info.attempts >= 3) {
        info.lockTime = now + 3 * 60 * 1000; // 3 minutes lockout
        loginAttempts.set(emailKey, info);
        return res.status(403).json({ 
          error: "Incorrect password. 3 failed attempts reached! Your account is blocked for 3 minutes." 
        });
      } else {
        loginAttempts.set(emailKey, info);
        return res.status(401).json({ 
          error: `Incorrect password. Attempt ${info.attempts} of 3.` 
        });
      }
    }
  }

  // 2. Regular user authentication check
  let user = db.users.find((u: any) => u && typeof u.email === "string" && u.email.toLowerCase().trim() === emailKey && u.pass === pass);
  if (user) {
    if (user.restricted) {
      return res.status(403).json({ error: "Access Denied: Your account has been restricted by Admin." });
    }
    
    // Clear any tracking on success
    loginAttempts.delete(emailKey);
    return res.json(user);
  } else {
    // Record failed attempt for standard emails
    let info = loginAttempts.get(emailKey) || { attempts: 0, lockTime: 0 };
    info.attempts += 1;
    if (info.attempts >= 3) {
      info.lockTime = now + 3 * 60 * 1000; // 3 minutes lockout
      loginAttempts.set(emailKey, info);
      return res.status(403).json({ 
        error: "Incorrect credentials. 3 failed attempts reached! Your account is blocked for 3 minutes." 
      });
    } else {
      loginAttempts.set(emailKey, info);
      return res.status(401).json({ 
        error: `Incorrect credentials. Attempt ${info.attempts} of 3.` 
      });
    }
  }
});

// Toggle client restriction (RESTRICT/UNRESTRICT option for Admin dashboard)
app.put("/api/users/:id/restrict", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  const { restricted } = req.body; // boolean

  db.users = db.users.map((u: any) => u.id === id ? { ...u, restricted: !!restricted } : u);
  saveDB(db);
  res.json({ success: true });
});

// Toggle user admin role (from Admin Panel, synced to default database)
app.put("/api/users/:id/role", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  const { isAdmin } = req.body; // boolean

  const targetedUser = db.users.find((u: any) => u.id === id);
  if (targetedUser && String(targetedUser.email || "").toLowerCase().trim() === "admin@tamimiqbal.com") {
    return res.status(403).json({ error: "Cannot modify Super Admin privileges" });
  }

  db.users = db.users.map((u: any) => u.id === id ? { ...u, isAdmin: !!isAdmin } : u);
  saveDB(db);
  res.json({ success: true });
});

// Products: Add
app.post("/api/products", (req, res) => {
  const db = loadDB();
  const newProduct = {
    ...req.body,
    id: Date.now().toString()
  };
  db.products.push(newProduct);
  saveDB(db);
  res.json(newProduct);
});

// Products: Update
app.put("/api/products/:id", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  const updated = req.body;
  db.products = db.products.map((p: any) => p.id === id ? { ...updated, id } : p);
  saveDB(db);
  res.json(updated);
});

// Products: Delete
app.delete("/api/products/:id", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  db.products = db.products.filter((p: any) => p.id !== id);
  saveDB(db);
  res.json({ success: true });
});

// Courses: Add
app.post("/api/courses", (req, res) => {
  const db = loadDB();
  const newCourse = {
    ...req.body,
    id: Date.now().toString(),
    videos: req.body.videos || []
  };
  db.courses.push(newCourse);
  saveDB(db);
  res.json(newCourse);
});

// Courses: Update
app.put("/api/courses/:id", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  const updated = req.body;
  db.courses = db.courses.map((c: any) => c.id === id ? { ...updated, id, videos: updated.videos || [] } : c);
  saveDB(db);
  res.json(updated);
});

// Courses: Delete
app.delete("/api/courses/:id", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  db.courses = db.courses.filter((c: any) => c.id !== id);
  saveDB(db);
  res.json({ success: true });
});

// Orders: Place
app.post("/api/orders", (req, res) => {
  const db = loadDB();
  const orderData = req.body;
  const newOrder = {
    ...orderData,
    id: "ORD-" + Math.floor(Math.random() * 1000000),
    status: "pending",
    date: new Date().toISOString()
  };
  db.orders.push(newOrder);
  saveDB(db);
  res.json(newOrder);
});

// Orders: Approve
app.put("/api/orders/:id/approve", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  db.orders = db.orders.map((o: any) => o.id === id ? { ...o, status: "approved" } : o);
  saveDB(db);
  res.json({ success: true });
});

// Orders: Dismiss
app.put("/api/orders/:id/dismiss", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  db.orders = db.orders.map((o: any) => o.id === id ? { ...o, status: "rejected" } : o);
  saveDB(db);
  res.json({ success: true });
});

// Promo codes: Add
app.post("/api/promos", (req, res) => {
  const db = loadDB();
  const newPromo = {
    ...req.body,
    id: Date.now().toString()
  };
  db.promoCodes.push(newPromo);
  saveDB(db);
  res.json(newPromo);
});

// Promo codes: Delete
app.delete("/api/promos/:id", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  db.promoCodes = db.promoCodes.filter((p: any) => p.id !== id);
  saveDB(db);
  res.json({ success: true });
});

// Contact messages: Add
app.post("/api/contact/message", (req, res) => {
  const db = loadDB();
  if (!db.contactMessages || !Array.isArray(db.contactMessages)) {
    db.contactMessages = [];
  }
  
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields (name, email, message) are required." });
  }

  const newMsg = {
    id: Date.now().toString(),
    name: name.trim(),
    email: email.trim(),
    message: message.trim(),
    date: new Date().toISOString()
  };
  
  db.contactMessages.push(newMsg);
  saveDB(db);
  res.json(newMsg);
});

// Contact messages: Delete
app.delete("/api/contact/messages/:id", (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  if (!db.contactMessages || !Array.isArray(db.contactMessages)) {
    db.contactMessages = [];
  }
  db.contactMessages = db.contactMessages.filter((m: any) => m.id !== id);
  saveDB(db);
  res.json({ success: true });
});

// Initialize Vite and Start Server async wrapper
async function startServer() {
  // Vite dev server mapping
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Admin account safeguard
  try {
    const currentDB = loadDB();
    const adminExists = currentDB.users.find(
      (u: any) => String(u.email || "").toLowerCase().trim() === "admin@tamimiqbal.com"
    );
    if (!adminExists) {
      currentDB.users.push({
        id: "admin_iqbal",
        name: "Admin Iqbal",
        email: "admin@tamimiqbal.com",
        pass: "7VolkJ00",
        isAdmin: true
      });
      saveDB(currentDB);
      console.log("Admin account created.");
    } else {
      let changed = false;
      currentDB.users = currentDB.users.map((u: any) => {
        if (String(u.email || "").toLowerCase().trim() === "admin@tamimiqbal.com") {
          if (u.pass !== "7VolkJ00" || !u.isAdmin) {
            changed = true;
            return { ...u, pass: "7VolkJ00", isAdmin: true };
          }
        }
        return u;
      });
      if (changed) {
        saveDB(currentDB);
        console.log("Admin account credential safeguard applied.");
      }
    }
  } catch (err) {
    console.error("Failed to safeguard admin account:", err);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express Syncing Database server running on http://localhost:${PORT}`);
  });
}

startServer();
