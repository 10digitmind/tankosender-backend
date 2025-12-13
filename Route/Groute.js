const express = require("express");
const router = express.Router();
const { protect,admin } = require("../middleware/Auth");
const multer = require("multer") ;
const path = require("path");

const {
  registerUser,
  verifyEmail,
  resetPassword,
  forgotPassword,
  loginUser,
  createSMTP,
  smtpConnection,
  testSMTP,
  createJob,
  editJob,
  startJob,
  getStatus,
  deleteSMTP,
  deleteJob,
  createSub,
  manualConfirmSubscription,
  getUserProfile,
  getSmtp,
  getEmailJob,
  getSub,
  changePassword

} = require("../Controller/controller");




const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads"); // make sure this folder exists
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
  fileFilter: function (req, file, cb) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "message/rfc822", // .eml
      "text/html"        // <-- allow HTML
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("File type not supported"));
    }

    cb(null, true);
  },
});





router.post("/api/register-user", registerUser);
router.post("/api/verify-email", verifyEmail);
router.post("/api/reset-password", resetPassword);
router.post("/api/send-reset-password", forgotPassword);
router.post("/api/login-user", loginUser);
router.post("/api/create-smtp", protect, createSMTP);
router.post("/api/connect-smtp", protect, smtpConnection);
router.post("/api/test-smtp", protect, testSMTP);
router.post("/api/create-job", protect, upload.array("attachments", 5), createJob);
router.patch("/api/edit-job/:id", protect, upload.array("attachments", 5), editJob);
router.post("/api/start-job/:jobId", protect, startJob);
router.get("/api/get-status/:jobId", protect, getStatus);
router.delete("/api/delete-smtp/:id", protect, deleteSMTP);
router.delete("/api/delete-job/:id", protect, deleteJob);
router.post("/api/create-sub/", protect, createSub);
router.post("/api/sub-confirm/:referenceId", protect, admin, manualConfirmSubscription);
router.get("/api/get-user-profile/", protect, getUserProfile);
router.get("/api/get-smtp/", protect, getSmtp);
router.get("/api/get-job/", protect, getEmailJob);
router.get("/api/get-sub/", protect, getSub);
router.patch("/api/change-password/", protect, changePassword);





module.exports = router;
