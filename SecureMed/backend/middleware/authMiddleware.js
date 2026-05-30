// backend/middleware/authMiddleware.js
import jwt  from "jsonwebtoken";
import User from "../models/user.js";

export const protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);

    // ── LIVE status check — catches suspensions that happened after login ──
    const user = await User.findById(decoded.id).select("-password").lean();
    if (!user)
      return res.status(401).json({ message: "User no longer exists" });
    if (user.status === "Suspended")
      return res.status(403).json({ message: "Account suspended. Contact administrator." });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};