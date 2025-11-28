const express = require("express");
const router = express.Router();
const { protect,admin } = require("../middleware/Auth");

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

router.post("/api/register-user", registerUser);
router.post("/api/verify-email", verifyEmail);
router.post("/api/reset-password", resetPassword);
router.post("/api/send-reset-password", forgotPassword);
router.post("/api/login-user", loginUser);
router.post("/api/create-smtp", protect, createSMTP);
router.post("/api/connect-smtp", protect, smtpConnection);
router.post("/api/test-smtp", protect, testSMTP);
router.post("/api/create-job", protect, createJob);
router.patch("/api/edit-job/:id", protect, editJob);
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
