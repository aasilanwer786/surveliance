import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Secure@Demo123!";

async function wipe() {
  const order = [
    prisma.detectorEvent,
    prisma.emergencyEvent,
    prisma.notificationDelivery,
    prisma.notification,
    prisma.auditLog,
    prisma.refreshToken,
    prisma.watchlistEntry,
    prisma.visitorExit,
    prisma.visitorEntry,
    prisma.visitorApproval,
    prisma.visitorInvitation,
    prisma.securityAlert,
    prisma.securityIncident,
    prisma.device,
    prisma.accessPoint,
    prisma.camera,
    prisma.voiceAlertConfig,
    prisma.systemSetting,
    prisma.resident,
    prisma.securityGuardProfile,
    prisma.user,
    prisma.apartment,
    prisma.floor,
    prisma.block,
    prisma.gate,
    prisma.building,
  ];
  for (const model of order) {
    await (model as { deleteMany: (args?: unknown) => Promise<unknown> }).deleteMany();
  }
}

const VOICE_DEFAULTS: { event: string; message: string; priority: string }[] = [
  { event: "VERIFY_OK", message: "Visitor verified.", priority: "LOW" },
  { event: "VERIFY_FAILED", message: "Warning. Visitor code could not be verified.", priority: "HIGH" },
  {
    event: "UNAUTHORIZED",
    message: "Security alert. An unverified visitor is attempting to enter the premises.",
    priority: "CRITICAL",
  },
  {
    event: "UNKNOWN_PERSON",
    message:
      "Security alert. An unidentified visitor has been detected inside the apartment premises. Security personnel are requested to verify immediately.",
    priority: "EMERGENCY",
  },
  { event: "OVERSTAY", message: "Alert. A visitor has exceeded the expected visit duration.", priority: "MEDIUM" },
  { event: "LOCKDOWN", message: "Emergency alert. Please follow security procedures immediately.", priority: "EMERGENCY" },
  { event: "EMERGENCY", message: "Emergency alert. Please follow security procedures immediately.", priority: "EMERGENCY" },
];

async function main() {
  console.log("Seeding database...");
  await wipe();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const superAdmin = await prisma.user.create({
    data: {
      email: "superadmin@secureresident.local",
      name: "Nadia Farooq",
      phone: "+92-300-0000001",
      role: "SUPER_ADMIN",
      passwordHash,
      status: "ACTIVE",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: "admin@secureresident.local",
      name: "Imran Sheikh",
      phone: "+92-300-0000002",
      role: "ADMIN",
      passwordHash,
      status: "ACTIVE",
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: "security@secureresident.local",
      name: "Kamran Ali",
      phone: "+92-300-0000003",
      role: "SECURITY",
      passwordHash,
      status: "ACTIVE",
    },
  });
  const guard1 = await prisma.user.create({
    data: {
      email: "guard1@secureresident.local",
      name: "Bilal Ahmed",
      phone: "+92-300-0000004",
      role: "GUARD",
      passwordHash,
      status: "ACTIVE",
    },
  });
  const guard2 = await prisma.user.create({
    data: {
      email: "guard2@secureresident.local",
      name: "Tariq Mehmood",
      phone: "+92-300-0000005",
      role: "GUARD",
      passwordHash,
      status: "ACTIVE",
    },
  });
  const residentAli = await prisma.user.create({
    data: {
      email: "ali@resident.local",
      name: "Ali Raza",
      phone: "+92-300-0000006",
      role: "RESIDENT",
      passwordHash,
      status: "ACTIVE",
    },
  });
  const residentHamza = await prisma.user.create({
    data: {
      email: "hamza@resident.local",
      name: "Hamza Khan",
      phone: "+92-300-0000007",
      role: "RESIDENT",
      passwordHash,
      status: "ACTIVE",
    },
  });
  const residentFatima = await prisma.user.create({
    data: {
      email: "fatima@resident.local",
      name: "Fatima Noor",
      phone: "+92-300-0000008",
      role: "RESIDENT",
      passwordHash,
      status: "ACTIVE",
    },
  });
  const residentSara = await prisma.user.create({
    data: {
      email: "sara@resident.local",
      name: "Sara Iqbal",
      phone: "+92-300-0000009",
      role: "RESIDENT",
      passwordHash,
      status: "ACTIVE",
    },
  });

  const building = await prisma.building.create({
    data: { name: "Sunrise Residency", code: "SR", address: "Sector 7, Main Boulevard", status: "ACTIVE" },
  });
  const blockA = await prisma.block.create({ data: { name: "Block A", code: "A", buildingId: building.id } });
  const blockB = await prisma.block.create({ data: { name: "Block B", code: "B", buildingId: building.id } });
  const aFloor1 = await prisma.floor.create({ data: { number: 1, label: "Ground", blockId: blockA.id } });
  const aFloor2 = await prisma.floor.create({ data: { number: 2, label: "First", blockId: blockA.id } });
  const bFloor2 = await prisma.floor.create({ data: { number: 2, label: "First", blockId: blockB.id } });

  const apt101 = await prisma.apartment.create({
    data: { flatNumber: "A-101", blockId: blockA.id, floorId: aFloor1.id, bedroomCount: 3, status: "ACTIVE" },
  });
  const apt102 = await prisma.apartment.create({
    data: { flatNumber: "A-102", blockId: blockA.id, floorId: aFloor1.id, bedroomCount: 4, status: "ACTIVE" },
  });
  const apt201 = await prisma.apartment.create({
    data: { flatNumber: "A-201", blockId: blockA.id, floorId: aFloor2.id, bedroomCount: 3, status: "ACTIVE" },
  });
  const aptB201 = await prisma.apartment.create({
    data: { flatNumber: "B-201", blockId: blockB.id, floorId: bFloor2.id, bedroomCount: 3, status: "ACTIVE" },
  });
  const aptB202 = await prisma.apartment.create({
    data: { flatNumber: "B-202", blockId: blockB.id, floorId: bFloor2.id, bedroomCount: 4, status: "ACTIVE" },
  });

  const residentRecAli = await prisma.resident.create({
    data: { userId: residentAli.id, apartmentId: apt102.id, relation: "OWNER", isPrimary: true },
  });
  const residentRecHamza = await prisma.resident.create({
    data: { userId: residentHamza.id, apartmentId: aptB202.id, relation: "OWNER", isPrimary: true },
  });
  const residentRecFatima = await prisma.resident.create({
    data: { userId: residentFatima.id, apartmentId: aptB201.id, relation: "OWNER", isPrimary: true },
  });
  const residentRecSara = await prisma.resident.create({
    data: { userId: residentSara.id, apartmentId: apt101.id, relation: "OWNER", isPrimary: true },
  });
  await prisma.resident.create({
    data: { userId: residentAli.id, apartmentId: apt201.id, relation: "TENANT", isPrimary: true },
  });

  const mainGate = await prisma.gate.create({
    data: { name: "Main Gate", code: "MAIN-1", type: "MAIN", location: "North entrance", buildingId: building.id, status: "ACTIVE" },
  });
  const gate2 = await prisma.gate.create({
    data: { name: "Gate 2", code: "GATE-2", type: "SECONDARY", location: "East entrance", buildingId: building.id, status: "ACTIVE" },
  });
  const serviceGate = await prisma.gate.create({
    data: { name: "Service Gate", code: "SVC-1", type: "SERVICE", location: "Rear service road", buildingId: building.id, status: "ACTIVE" },
  });

  await prisma.securityGuardProfile.create({
    data: { userId: guard1.id, employeeCode: "GRD-001", assignedGateId: mainGate.id, phone: guard1.phone, shiftStart: "08:00", shiftEnd: "20:00" },
  });
  await prisma.securityGuardProfile.create({
    data: { userId: guard2.id, employeeCode: "GRD-002", assignedGateId: gate2.id, phone: guard2.phone, shiftStart: "20:00", shiftEnd: "08:00" },
  });

  for (const v of VOICE_DEFAULTS) {
    await prisma.voiceAlertConfig.create({
      data: {
        event: v.event,
        message: v.message,
        priority: v.priority,
        enabled: true,
        volume: v.event === "VERIFY_OK" ? 0.7 : 1,
        repeatCount: v.event === "UNKNOWN_PERSON" ? 3 : 1,
        repeatIntervalSeconds: 3,
        targetRoles: "GUARD,ADMIN,SECURITY",
      },
    });
  }

  const settings: [string, string][] = [
    ["approvalPolicy", "RESIDENT"],
    ["voiceAlertsEnabled", "true"],
    ["overstayEnabled", "true"],
    ["overstayGraceMinutes", "15"],
    ["allowInvitationExtension", "true"],
    ["maxInvitationDaysAhead", "30"],
    ["invitationDefaultDurationMinutes", "120"],
    ["invitationArrivalWindowMinutes", "60"],
    ["visitorDataRetentionDays", "90"],
    ["retentionAnonymizationEnabled", "false"],
    ["requireVehicleNumber", "false"],
    ["notifyChannels", "IN_APP,PUSH"],
    ["alertChannels", "IN_APP,PUSH"],
    ["systemName", "SecureResident"],
    ["integrationApiKey", "demo-integration-key-change-me"],
  ];
  for (const [key, value] of settings) {
    await prisma.systemSetting.create({ data: { key, value, updatedBy: superAdmin.id } });
  }

  const now = Date.now();
  const at = (min: number) => new Date(now + min * 60_000);

  await prisma.visitorInvitation.create({
    data: {
      code: "VIS-2026-GUEST1",
      visitorName: "Ahmed Hassan",
      visitorPhone: "+92-321-5550101",
      purpose: "Family visit",
      vehicleNumber: "ABC-1234",
      notes: "Bringing dinner for the family",
      residentId: residentRecAli.id,
      apartmentId: apt102.id,
      createdById: residentAli.id,
      expectedAt: at(20),
      arriveFrom: at(-30),
      arriveUntil: at(50),
      expectedExitAt: at(140),
      durationMinutes: 120,
      expiresAt: at(50),
      maxUses: 1,
      approvalPolicy: "RESIDENT",
      status: "ACTIVE",
      visitStatus: "EXPECTED",
      createdBy: residentAli.id,
    },
  });

  const insideInvite = await prisma.visitorInvitation.create({
    data: {
      code: "VIS-2026-INSID1",
      visitorName: "Sara Noor",
      visitorPhone: "+92-321-5550102",
      purpose: "Maintenance work",
      vehicleNumber: "KLM-7788",
      residentId: residentRecHamza.id,
      apartmentId: aptB202.id,
      createdById: residentHamza.id,
      expectedAt: at(-45),
      arriveFrom: at(-75),
      arriveUntil: at(30),
      expectedExitAt: at(45),
      durationMinutes: 90,
      expiresAt: at(30),
      usedCount: 1,
      maxUses: 1,
      approvalPolicy: "AUTO",
      status: "ACTIVE",
      visitStatus: "INSIDE",
      entryGateId: mainGate.id,
      createdBy: residentHamza.id,
    },
  });
  await prisma.visitorEntry.create({
    data: {
      invitationId: insideInvite.id,
      gateId: mainGate.id,
      guardId: guard1.id,
      vehicleNumber: "KLM-7788",
      source: "QR",
      enteredAt: at(-40),
    },
  });

  const doneInvite = await prisma.visitorInvitation.create({
    data: {
      code: "VIS-2026-DONE01",
      visitorName: "Rehan Aslam",
      visitorPhone: "+92-321-5550103",
      purpose: "Delivered parcel",
      residentId: residentRecAli.id,
      apartmentId: apt102.id,
      createdById: residentAli.id,
      expectedAt: at(-180),
      arriveFrom: at(-210),
      arriveUntil: at(-120),
      expectedExitAt: at(-60),
      durationMinutes: 120,
      expiresAt: at(-120),
      usedCount: 1,
      maxUses: 1,
      approvalPolicy: "AUTO",
      status: "ACTIVE",
      visitStatus: "EXITED",
      entryGateId: mainGate.id,
      exitGateId: mainGate.id,
      createdBy: residentAli.id,
    },
  });
  const doneEntry = await prisma.visitorEntry.create({
    data: { invitationId: doneInvite.id, gateId: mainGate.id, guardId: guard1.id, enteredAt: at(-170) },
  });
  await prisma.visitorExit.create({
    data: { invitationId: doneInvite.id, gateId: mainGate.id, guardId: guard1.id, durationMinutes: 105, exitedAt: at(-65) },
  });

  await prisma.visitorInvitation.create({
    data: {
      code: "VIS-2026-EXPRD1",
      visitorName: "Old Guest",
      residentId: residentRecSara.id,
      apartmentId: apt101.id,
      createdById: residentSara.id,
      expectedAt: at(-1500),
      arriveFrom: at(-1560),
      arriveUntil: at(-1440),
      expectedExitAt: at(-1380),
      durationMinutes: 120,
      expiresAt: at(-1440),
      approvalPolicy: "RESIDENT",
      status: "EXPIRED",
      visitStatus: "EXPECTED",
      createdBy: residentSara.id,
    },
  });

  const pendingInvite = await prisma.visitorInvitation.create({
    data: {
      code: "VIS-2026-APRV01",
      visitorName: "Usman Tariq",
      visitorPhone: "+92-321-5550104",
      purpose: "Guest for dinner",
      residentId: residentRecFatima.id,
      apartmentId: aptB201.id,
      createdById: residentFatima.id,
      expectedAt: at(10),
      arriveFrom: at(-20),
      arriveUntil: at(40),
      expectedExitAt: at(130),
      durationMinutes: 120,
      expiresAt: at(40),
      approvalPolicy: "RESIDENT",
      status: "ACTIVE",
      visitStatus: "AWAITING_APPROVAL",
      createdBy: residentFatima.id,
    },
  });
  await prisma.visitorApproval.create({
    data: { invitationId: pendingInvite.id, type: "RESIDENT", status: "PENDING" },
  });

  await prisma.visitorInvitation.create({
    data: {
      code: "VIS-2026-CANCL1",
      visitorName: "Cancelled Person",
      residentId: residentRecAli.id,
      apartmentId: apt102.id,
      createdById: residentAli.id,
      expectedAt: at(120),
      arriveFrom: at(90),
      arriveUntil: at(180),
      expectedExitAt: at(240),
      durationMinutes: 120,
      expiresAt: at(180),
      approvalPolicy: "RESIDENT",
      status: "CANCELLED",
      visitStatus: "DENIED",
      rejectReason: "Cancelled by resident",
      createdBy: residentAli.id,
    },
  });

  const todayCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const alert1 = await prisma.securityAlert.create({
    data: {
      code: `ALT-${todayCode}-SEED1`,
      type: "INVALID_CODE",
      priority: "HIGH",
      status: "NEW",
      title: "Unauthorized visitor attempt at gate",
      description: "An unrecognised visitor code was presented at Main Gate.",
      gateId: mainGate.id,
      location: "Main Gate",
      subjectName: "Unknown male",
      createdAt: at(-90),
    },
  });
  await prisma.securityAlert.create({
    data: {
      code: `ALT-${todayCode}-SEED2`,
      type: "EXPIRED_CODE",
      priority: "MEDIUM",
      status: "RESOLVED",
      title: "Expired invitation presented at Gate 2",
      description: "Visitor arrived after the invitation window had closed.",
      gateId: gate2.id,
      location: "Gate 2",
      subjectName: "Old Guest",
      acknowledgedAt: at(-300),
      resolvedAt: at(-280),
      resolution: "Resident extended the invitation; visitor entered legitimately.",
      resolvedById: supervisor.id,
      createdAt: at(-320),
    },
  });

  const alertUnknown = await prisma.securityAlert.create({
    data: {
      code: `ALT-${todayCode}-SEED3`,
      type: "UNKNOWN_PERSON",
      priority: "CRITICAL",
      status: "ACKNOWLEDGED",
      title: "Unidentified person detected inside premises",
      description:
        "Security alert. An unidentified visitor has been detected inside the apartment premises without a corresponding valid entry record.",
      gateId: gate2.id,
      location: "Block B corridor",
      subjectName: "Unknown person",
      acknowledgedById: supervisor.id,
      acknowledgedAt: at(-120),
      createdAt: at(-130),
    },
  });
  const incident = await prisma.securityIncident.create({
    data: {
      code: `INC-${todayCode}-SEED1`,
      type: "UNKNOWN_PERSON",
      priority: "CRITICAL",
      status: "INVESTIGATING",
      title: "Unidentified person detected near Block B",
      description: "Camera analytics flagged a person with no matching entry record near Block B lobby.",
      location: "Block B corridor",
      gateId: gate2.id,
      subjectName: "Unknown person",
      actionsTaken: "Guard dispatched; corridor sweep in progress.",
      reportedById: supervisor.id,
      assignedGuardId: guard2.id,
      createdAt: at(-130),
    },
  });
  await prisma.securityAlert.update({ where: { id: alertUnknown.id }, data: { incidentId: incident.id } });

  const closedIncident = await prisma.securityIncident.create({
    data: {
      code: `INC-${todayCode}-SEED2`,
      type: "UNAUTHORIZED_VISITOR",
      priority: "HIGH",
      status: "CLOSED",
      title: "Tailgating attempt at Main Gate",
      description: "A person attempted to follow a vehicle through the barrier without a valid invitation.",
      location: "Main Gate",
      gateId: mainGate.id,
      subjectName: "Unknown person",
      actionsTaken: "Guard stopped the person, recorded details and turned them away.",
      resolution: "No entry granted; identity verified as a delivery contractor, invitation created.",
      reportedById: admin.id,
      closedById: supervisor.id,
      closedAt: at(-600),
      createdAt: at(-700),
    },
  });
  void alert1;
  void closedIncident;

  await prisma.watchlistEntry.create({
    data: {
      name: "Javed Malik",
      phone: "+92-300-9991111",
      vehicle: "LEX-4455",
      reason: "Previously caught trespassing in the basement",
      level: "BLOCKED",
      status: "ACTIVE",
      createdById: supervisor.id,
    },
  });

  await prisma.camera.create({
    data: {
      name: "Main Gate Camera 1",
      location: "Above barrier",
      protocol: "RTSP",
      endpoint: "rtsp://192.168.10.21:554/stream1",
      username: "admin",
      status: "ONLINE",
      area: "Main Gate",
      gateId: mainGate.id,
      integrationType: "ONVIF",
      lastHeartbeatAt: new Date(),
      createdBy: admin.id,
    },
  });
  await prisma.camera.create({
    data: {
      name: "Block B Lobby Cam",
      location: "Lobby ceiling",
      protocol: "RTSP",
      endpoint: "rtsp://192.168.10.22:554/stream1",
      status: "OFFLINE",
      area: "Block B Lobby",
      integrationType: "GENERIC",
      createdBy: admin.id,
    },
  });

  await prisma.accessPoint.create({
    data: { name: "Main Barrier", type: "BARRIER", endpoint: "http://192.168.10.31/api", protocol: "HTTP", status: "ONLINE", gateId: mainGate.id, createdBy: admin.id },
  });
  await prisma.accessPoint.create({
    data: { name: "Pedestrian Turnstile", type: "TURNSTILE", endpoint: "http://192.168.10.32/api", protocol: "HTTP", status: "ONLINE", gateId: mainGate.id, createdBy: admin.id },
  });
  await prisma.device.create({
    data: { name: "Gate Speaker", type: "SPEAKER", location: "Main Gate", status: "ONLINE", lastHeartbeatAt: new Date() },
  });
  await prisma.device.create({
    data: { name: "Main Gate QR Scanner", type: "SCANNER", location: "Main Gate cabin", status: "ONLINE", lastHeartbeatAt: new Date() },
  });

  const detectorAlert = await prisma.securityAlert.create({
    data: {
      code: `ALT-${todayCode}-SEED4`,
      type: "UNKNOWN_PERSON",
      priority: "CRITICAL",
      status: "NEW",
      title: "Unidentified person detected inside premises",
      description: "Video analytics detected a person near Gate 2 with no matching entry record.",
      gateId: gate2.id,
      location: "Gate 2 waiting area",
      createdAt: at(-15),
    },
  });
  const detectorIncident = await prisma.securityIncident.create({
    data: {
      code: `INC-${todayCode}-SEED3`,
      type: "UNKNOWN_PERSON",
      priority: "CRITICAL",
      status: "NEW",
      title: "Unknown person alert from CCTV integration",
      description: "Detector event created automatically from camera analytics.",
      location: "Gate 2 waiting area",
      gateId: gate2.id,
      reportedById: supervisor.id,
      createdAt: at(-15),
    },
  });
  await prisma.securityAlert.update({ where: { id: detectorAlert.id }, data: { incidentId: detectorIncident.id } });
  const detectorCam = await prisma.camera.findFirst({ where: { name: "Main Gate Camera 1" } });
  await prisma.detectorEvent.create({
    data: {
      source: "CCTV",
      type: "UNKNOWN_PERSON",
      area: "Gate 2 waiting area",
      gateId: gate2.id,
      cameraId: detectorCam?.id ?? null,
      confidence: 0.91,
      payload: JSON.stringify({ note: "seeded detector event" }),
      status: "PROCESSED",
      alertId: detectorAlert.id,
      createdAt: at(-15),
    },
  });

  await prisma.notification.create({
    data: {
      userId: residentAli.id,
      type: "VISITOR_EXIT",
      title: "Visitor exited the premises",
      body: "Your visitor Rehan Aslam has exited the premises through Main Gate.",
      priority: "LOW",
      createdAt: at(-65),
    },
  });
  await prisma.notification.create({
    data: {
      userId: residentFatima.id,
      type: "VISITOR_APPROVAL_REQUEST",
      title: "Visitor waiting at the gate",
      body: "Your visitor Usman Tariq is waiting for entry approval.",
      priority: "MEDIUM",
      createdAt: at(-10),
    },
  });

  await prisma.auditLog.createMany({
    data: [
      { userId: superAdmin.id, userRole: "SUPER_ADMIN", action: "LOGIN", entity: "User", entityId: superAdmin.id, result: "SUCCESS", ip: "127.0.0.1", createdAt: at(-1000) },
      { userId: residentAli.id, userRole: "RESIDENT", action: "INVITATION_CREATED", entity: "VisitorInvitation", result: "SUCCESS", ip: "127.0.0.1", createdAt: at(-60) },
      { userId: guard1.id, userRole: "GUARD", action: "CODE_VERIFIED", entity: "VisitorInvitation", result: "FAILURE", ip: "127.0.0.1", metadata: JSON.stringify({ outcome: "NOT_FOUND" }), createdAt: at(-90) },
      { userId: guard1.id, userRole: "GUARD", action: "VISITOR_ENTRY", entity: "VisitorInvitation", result: "SUCCESS", ip: "127.0.0.1", createdAt: at(-40) },
      { userId: guard1.id, userRole: "GUARD", action: "VISITOR_EXIT", entity: "VisitorInvitation", result: "SUCCESS", ip: "127.0.0.1", createdAt: at(-65) },
    ],
  });

  console.log("Seed complete.");
  console.log("  Super admin : superadmin@secureresident.local / " + DEMO_PASSWORD);
  console.log("  Admin       : admin@secureresident.local / " + DEMO_PASSWORD);
  console.log("  Security    : security@secureresident.local / " + DEMO_PASSWORD);
  console.log("  Guard 1     : guard1@secureresident.local / " + DEMO_PASSWORD);
  console.log("  Resident    : ali@resident.local / " + DEMO_PASSWORD);
  console.log("  Demo code   : VIS-2026-GUEST1 (valid, awaiting resident approval)");
  console.log("  Inside code : VIS-2026-INSID1 (currently inside)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
