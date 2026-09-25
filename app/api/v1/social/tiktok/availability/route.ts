import {requireUser} from '@/lib/auth';
import {tiktokConfigured,tiktokDirectEnabled} from '@/lib/tiktok';
export async function GET(){await requireUser();return Response.json({enabled:tiktokConfigured()&&tiktokDirectEnabled()});}
