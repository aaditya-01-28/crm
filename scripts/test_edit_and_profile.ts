const BASE_URL = "http://localhost:3000";

async function test() {
  console.log("==================================================");
  console.log("🧪 TESTING TEAM MEMBER EDIT & PROFILE RESTRICTION");
  console.log("==================================================");

  // 1. Login as Super Admin
  const adminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "aaditya@textorasms.com", password: "Admin@1234" }),
  });
  const adminData = await adminLogin.json();
  const adminToken = adminData.accessToken;
  console.log("1. Super Admin login status:", adminLogin.status);

  // 2. Fetch team members
  const teamRes = await fetch(`${BASE_URL}/api/team`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      Cookie: `token=${adminToken}`,
    },
  });
  const teamData = await teamRes.json();
  const manager = teamData.users?.find((u: any) => u.email === "manager@textorasms.com");
  console.log("2. Found manager:", manager?.fullName, manager?.email, "Current phone:", manager?.phoneNumber);

  // 3. Super Admin updates manager phone number & name
  const updateRes = await fetch(`${BASE_URL}/api/team/${manager.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      Cookie: `token=${adminToken}`,
    },
    body: JSON.stringify({
      fullName: "Sales Manager (Updated)",
      email: "manager@textorasms.com",
      phoneNumber: "+91 99887 76655",
      role: "sales_manager",
    }),
  });
  const updateData = await updateRes.json();
  console.log("3. Super Admin update manager details response:", updateRes.status, updateData.message);
  console.log("   Updated user from DB:", updateData.user?.fullName, updateData.user?.phoneNumber);

  if (updateData.user?.phoneNumber !== "+91 99887 76655" || updateData.user?.fullName !== "Sales Manager (Updated)") {
    throw new Error("Update failed to persist in database!");
  }
  console.log("✅ Step 3 Passed: Super Admin can update team member phone and name!");

  // 4. Login as Rep 1 (Level 1)
  const repLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "rep1@textorasms.com", password: "Rep@1234" }),
  });
  const repData = await repLogin.json();
  const repToken = repData.accessToken;
  console.log("4. Rep 1 login status:", repLogin.status);

  // 5. Test non-super-admin attempting to change password via /api/profile
  const profilePatch = await fetch(`${BASE_URL}/api/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${repToken}`,
      Cookie: `token=${repToken}`,
    },
    body: JSON.stringify({
      phoneNumber: "+91 11111 22222",
      newPassword: "HackedPassword123!",
    }),
  });
  console.log("5. Profile password change status (expected 403):", profilePatch.status);
  if (profilePatch.status !== 403) {
    throw new Error("Expected 403 when user attempts password change in profile!");
  }
  console.log("✅ Step 5 Passed: Profile password changing is strictly disabled!");

  // 6. Test non-super-admin attempting to update phone number in /api/profile (should be ignored for non-super-admin)
  const phonePatch = await fetch(`${BASE_URL}/api/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${repToken}`,
      Cookie: `token=${repToken}`,
    },
    body: JSON.stringify({
      fullName: "Sales Rep 1",
      phoneNumber: "+91 11111 22222",
    }),
  });
  const phoneData = await phonePatch.json();
  console.log("6. Profile phone update response:", phoneData.user?.phoneNumber);
  if (phoneData.user?.phoneNumber === "+91 11111 22222") {
    throw new Error("Non-super-admin was able to change their phone number in profile!");
  }
  console.log("✅ Step 6 Passed: Non-super-admin cannot change their phone number in profile!");

  // 7. Cleanup: Restore manager name and phone
  await fetch(`${BASE_URL}/api/team/${manager.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      Cookie: `token=${adminToken}`,
    },
    body: JSON.stringify({
      fullName: "Sales Manager",
      email: "manager@textorasms.com",
      phoneNumber: null,
      role: "sales_manager",
    }),
  });
  console.log("7. Cleaned up and restored manager details.");

  console.log("==================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

test().catch((e) => {
  console.error("❌ TEST FAILED:", e);
  process.exit(1);
});
