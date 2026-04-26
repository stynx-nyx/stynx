-- @security-definer-approved: platform-architect/ARCH-124
CREATE FUNCTION audit.snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN;
END
$$;
