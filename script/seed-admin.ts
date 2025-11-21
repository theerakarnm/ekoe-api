import { auth } from "../src/libs/auth";
import { db } from "../src/core/database";
import { adminRoles, adminUsers } from "../src/core/database/schema/admin.schema";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

const ADMIN_EMAIL = "admin@ekoe.com";
const ADMIN_PASSWORD = "password123";
const ADMIN_NAME = "Admin User";

async function seedAdmin() {
  console.log("🌱 Seeding admin account...");

  try {
    // 1. Create or get 'Super Admin' role
    let roleId: string;
    const existingRole = await db.query.adminRoles.findFirst({
      where: eq(adminRoles.name, "Super Admin"),
    });

    if (existingRole) {
      console.log("ℹ️ 'Super Admin' role already exists.");
      roleId = existingRole.id;
    } else {
      console.log("creating 'Super Admin' role...");
      const [newRole] = await db.insert(adminRoles).values({
        name: "Super Admin",
        description: "Full access to all features",
        permissions: ["*"],
      }).returning();
      roleId = newRole.id;
      console.log("✅ 'Super Admin' role created.");
    }

    // 2. Create user using Better Auth
    // We need to check if user exists first to avoid error
    // better-auth doesn't expose a direct "findUserByEmail" easily on the api surface without context sometimes,
    // so let's try to sign up. If it fails, we assume user exists.
    // Actually, we can check the DB directly for the user since we have access to schema.

    // Note: We can't easily query 'users' table because it's defined in auth-schema but might not be exported in a way 
    // that db.query.users works if it's not in the schema passed to drizzle() or if the export name differs.
    // Let's check schema export in src/core/database/index.ts -> it imports * as schema from './schema'.
    // And src/core/database/schema/index.ts exports * from './auth-schema'.
    // So db.query.users should work.

    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, ADMIN_EMAIL),
    });

    let userId: string;

    if (existingUser) {
      console.log("ℹ️ Admin user already exists.");
      userId = existingUser.id;
    } else {
      console.log("Creating admin user...");
      const user = await auth.api.signUpEmail({
        body: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          name: ADMIN_NAME,
        }
      });

      if (!user) {
        throw new Error("Failed to create admin user");
      }

      userId = user.user.id;
      console.log("✅ Admin user created.");
    }

    // 3. Assign admin role
    const existingAdminUser = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.userId, userId),
    });

    if (existingAdminUser) {
      console.log("ℹ️ User is already an admin.");
    } else {
      console.log("Assigning 'Super Admin' role to user...");
      await db.insert(adminUsers).values({
        userId: userId,
        roleId: roleId,
      });
      console.log("✅ User assigned as 'Super Admin'.");
    }

    console.log("✨ Admin seeding completed successfully!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedAdmin();
