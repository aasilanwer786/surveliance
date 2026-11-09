-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "avatarPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Block_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "blockId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Floor_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Apartment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flatNumber" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "bedroomCount" INTEGER,
    "area" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" DATETIME,
    CONSTRAINT "Apartment_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Apartment_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'OWNER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "moveInDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" DATETIME,
    CONSTRAINT "Resident_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Resident_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityGuardProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "assignedGateId" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "shiftStart" TEXT,
    "shiftEnd" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SecurityGuardProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SecurityGuardProfile_assignedGateId_fkey" FOREIGN KEY ("assignedGateId") REFERENCES "Gate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Gate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MAIN',
    "location" TEXT,
    "buildingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" DATETIME,
    CONSTRAINT "Gate_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisitorInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorPhone" TEXT,
    "visitorPhotoPath" TEXT,
    "purpose" TEXT,
    "vehicleNumber" TEXT,
    "notes" TEXT,
    "residentId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expectedAt" DATETIME NOT NULL,
    "arriveFrom" DATETIME NOT NULL,
    "arriveUntil" DATETIME NOT NULL,
    "expectedExitAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "visitStatus" TEXT NOT NULL DEFAULT 'EXPECTED',
    "approvalPolicy" TEXT,
    "allowedGateIds" TEXT,
    "overstayAlertedAt" DATETIME,
    "entryGateId" TEXT,
    "exitGateId" TEXT,
    "decidedAt" DATETIME,
    "decidedById" TEXT,
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" DATETIME,
    CONSTRAINT "VisitorInvitation_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VisitorInvitation_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VisitorInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisitorApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invitationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "decidedById" TEXT,
    "reason" TEXT,
    CONSTRAINT "VisitorApproval_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "VisitorInvitation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VisitorApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisitorEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invitationId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "photoPath" TEXT,
    "vehicleNumber" TEXT,
    "deviceInfo" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitorEntry_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "VisitorInvitation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VisitorEntry_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VisitorEntry_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisitorExit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invitationId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "durationMinutes" INTEGER,
    "exitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitorExit_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "VisitorInvitation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VisitorExit_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VisitorExit_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "phone" TEXT,
    "vehicle" TEXT,
    "reason" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'WATCHLIST',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WatchlistEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gateId" TEXT,
    "location" TEXT,
    "subjectName" TEXT,
    "subjectPhone" TEXT,
    "photoPath" TEXT,
    "invitationId" TEXT,
    "detectorEventId" TEXT,
    "incidentId" TEXT,
    "acknowledgedById" TEXT,
    "acknowledgedAt" DATETIME,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SecurityAlert_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityAlert_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "VisitorInvitation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityAlert_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "gateId" TEXT,
    "subjectName" TEXT,
    "subjectPhone" TEXT,
    "photoPath" TEXT,
    "actionsTaken" TEXT,
    "resolution" TEXT,
    "reportedById" TEXT NOT NULL,
    "assignedGuardId" TEXT,
    "closedById" TEXT,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SecurityIncident_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SecurityIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SecurityIncident_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'LOW',
    "data" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceAlertConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" TEXT NOT NULL DEFAULT 'HIGH',
    "voice" TEXT NOT NULL DEFAULT 'en-US',
    "volume" REAL NOT NULL DEFAULT 1.0,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "repeatIntervalSeconds" INTEGER NOT NULL DEFAULT 3,
    "targetRoles" TEXT NOT NULL DEFAULT 'GUARD,ADMIN,SECURITY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "protocol" TEXT NOT NULL DEFAULT 'RTSP',
    "endpoint" TEXT NOT NULL,
    "username" TEXT,
    "passwordEnc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "area" TEXT,
    "gateId" TEXT,
    "integrationType" TEXT NOT NULL DEFAULT 'GENERIC',
    "lastHeartbeatAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" DATETIME,
    CONSTRAINT "Camera_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GATE',
    "endpoint" TEXT,
    "protocol" TEXT NOT NULL DEFAULT 'HTTP',
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "gateId" TEXT,
    "deviceId" TEXT,
    "lastHeartbeatAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    CONSTRAINT "AccessPoint_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "location" TEXT,
    "endpoint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastHeartbeatAt" DATETIME,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "ip" TEXT,
    "device" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmergencyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "activatedById" TEXT NOT NULL,
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" TEXT,
    "releasedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DetectorEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'CCTV',
    "type" TEXT NOT NULL,
    "area" TEXT,
    "gateId" TEXT,
    "cameraId" TEXT,
    "confidence" REAL,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "alertId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DetectorEvent_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DetectorEvent_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DetectorEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "SecurityAlert" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Building_code_key" ON "Building"("code");

-- CreateIndex
CREATE INDEX "Block_buildingId_idx" ON "Block"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_buildingId_code_key" ON "Block"("buildingId", "code");

-- CreateIndex
CREATE INDEX "Floor_blockId_idx" ON "Floor"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_blockId_number_key" ON "Floor"("blockId", "number");

-- CreateIndex
CREATE INDEX "Apartment_blockId_idx" ON "Apartment"("blockId");

-- CreateIndex
CREATE INDEX "Apartment_floorId_idx" ON "Apartment"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "Apartment_blockId_flatNumber_key" ON "Apartment"("blockId", "flatNumber");

-- CreateIndex
CREATE INDEX "Resident_apartmentId_idx" ON "Resident"("apartmentId");

-- CreateIndex
CREATE INDEX "Resident_userId_idx" ON "Resident"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_userId_apartmentId_key" ON "Resident"("userId", "apartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityGuardProfile_userId_key" ON "SecurityGuardProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityGuardProfile_employeeCode_key" ON "SecurityGuardProfile"("employeeCode");

-- CreateIndex
CREATE INDEX "SecurityGuardProfile_assignedGateId_idx" ON "SecurityGuardProfile"("assignedGateId");

-- CreateIndex
CREATE UNIQUE INDEX "Gate_code_key" ON "Gate"("code");

-- CreateIndex
CREATE INDEX "Gate_buildingId_idx" ON "Gate"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorInvitation_code_key" ON "VisitorInvitation"("code");

-- CreateIndex
CREATE INDEX "VisitorInvitation_residentId_idx" ON "VisitorInvitation"("residentId");

-- CreateIndex
CREATE INDEX "VisitorInvitation_apartmentId_idx" ON "VisitorInvitation"("apartmentId");

-- CreateIndex
CREATE INDEX "VisitorInvitation_status_visitStatus_idx" ON "VisitorInvitation"("status", "visitStatus");

-- CreateIndex
CREATE INDEX "VisitorInvitation_expectedAt_idx" ON "VisitorInvitation"("expectedAt");

-- CreateIndex
CREATE INDEX "VisitorApproval_status_idx" ON "VisitorApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorApproval_invitationId_type_key" ON "VisitorApproval"("invitationId", "type");

-- CreateIndex
CREATE INDEX "VisitorEntry_invitationId_idx" ON "VisitorEntry"("invitationId");

-- CreateIndex
CREATE INDEX "VisitorEntry_gateId_idx" ON "VisitorEntry"("gateId");

-- CreateIndex
CREATE INDEX "VisitorEntry_enteredAt_idx" ON "VisitorEntry"("enteredAt");

-- CreateIndex
CREATE INDEX "VisitorExit_invitationId_idx" ON "VisitorExit"("invitationId");

-- CreateIndex
CREATE INDEX "VisitorExit_exitedAt_idx" ON "VisitorExit"("exitedAt");

-- CreateIndex
CREATE INDEX "WatchlistEntry_phone_idx" ON "WatchlistEntry"("phone");

-- CreateIndex
CREATE INDEX "WatchlistEntry_status_level_idx" ON "WatchlistEntry"("status", "level");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityAlert_code_key" ON "SecurityAlert"("code");

-- CreateIndex
CREATE INDEX "SecurityAlert_status_priority_idx" ON "SecurityAlert"("status", "priority");

-- CreateIndex
CREATE INDEX "SecurityAlert_createdAt_idx" ON "SecurityAlert"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlert_type_idx" ON "SecurityAlert"("type");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityIncident_code_key" ON "SecurityIncident"("code");

-- CreateIndex
CREATE INDEX "SecurityIncident_status_idx" ON "SecurityIncident"("status");

-- CreateIndex
CREATE INDEX "SecurityIncident_createdAt_idx" ON "SecurityIncident"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_idx" ON "NotificationDelivery"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceAlertConfig_event_key" ON "VoiceAlertConfig"("event");

-- CreateIndex
CREATE INDEX "Camera_gateId_idx" ON "Camera"("gateId");

-- CreateIndex
CREATE INDEX "Camera_status_idx" ON "Camera"("status");

-- CreateIndex
CREATE INDEX "AccessPoint_gateId_idx" ON "AccessPoint"("gateId");

-- CreateIndex
CREATE INDEX "Device_type_idx" ON "Device"("type");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DetectorEvent_alertId_key" ON "DetectorEvent"("alertId");

-- CreateIndex
CREATE INDEX "DetectorEvent_status_type_idx" ON "DetectorEvent"("status", "type");

-- CreateIndex
CREATE INDEX "DetectorEvent_createdAt_idx" ON "DetectorEvent"("createdAt");
