import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "frame-ancestors": ["'self'", "https://*.google.com", "https://*.run.app", "https://*.aistudio.google.com"],
          "img-src": ["'self'", "data:", "https:", "http:"],
          "media-src": ["'self'", "data:", "https:", "http:"],
          "connect-src": ["'self'", "https:", "wss:", "ws:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const PORT = Number(process.env.PORT) || 3000;

  // Socket.IO state
  const users = new Map<string, string>(); // socketId -> userId

  io.on("connection", (socket) => {
    console.log("Connection established:", socket.id);

    socket.on("join", (userId: string) => {
      users.set(socket.id, userId);
      socket.join(userId);
      console.log(`User ${userId} joined`);
      io.emit("user_status", { userId, status: "online" });
    });

    socket.on("join_group", (groupId: string) => {
      socket.join(groupId);
      console.log(`Joined group: ${groupId}`);
    });

    // Chat events
    socket.on("send_message", (data: any) => {
      const target = data.isGroup ? data.chatId : data.receiverId;
      io.to(target).emit("receive_message", data);
    });

    socket.on("typing", (data: any) => {
      io.to(data.receiverId).emit("user_typing", data);
    });

    // WebRTC Signaling
    socket.on("call_user", (data: any) => {
      io.to(data.userToCall).emit("incoming_call", { 
        offer: data.signalData, 
        from: data.from, 
        name: data.name,
        photoURL: data.photoURL,
        isAudioOnly: data.isAudioOnly,
        isScreenShare: data.isScreenShare,
        quality: data.quality
      });
    });

    socket.on("answer_call", (data: any) => {
      io.to(data.to).emit("call_accepted", { answer: data.signal });
    });

    socket.on("ice_candidate", (data: any) => {
      io.to(data.to).emit("ice_candidate", { candidate: data.candidate });
    });

    socket.on("reject_call", (data: any) => {
      io.to(data.to).emit("call_rejected");
    });

    socket.on("end_call", (data: any) => {
      io.to(data.to).emit("call_ended");
    });

    socket.on("disconnect", () => {
      const userId = users.get(socket.id);
      if (userId) {
        users.delete(socket.id);
        io.emit("user_status", { userId, status: "offline" });
      }
      console.log("Disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Tarsus Server active on port ${PORT}`);
  });
}

startServer();
