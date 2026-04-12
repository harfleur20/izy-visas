
-- Drop the permissive update policy
DROP POLICY "Service role can update payments" ON public.payments;

-- Create a restricted update policy for service_role only
CREATE POLICY "Service role can update payments"
  ON public.payments FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
