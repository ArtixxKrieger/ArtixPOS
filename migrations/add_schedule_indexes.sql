-- Speed up getTenantUserIds: filters users by tenant_id
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- Speed up getStaffSchedules / getScheduleEmployees: both filter by user_id
CREATE INDEX IF NOT EXISTS idx_staff_schedules_user_id ON staff_schedules(user_id);

-- Speed up any direct tenant-scoped schedule queries
CREATE INDEX IF NOT EXISTS idx_staff_schedules_tenant_id ON staff_schedules(tenant_id);
