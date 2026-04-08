import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { insertServiceRoomSchema, type ServiceRoom } from "@shared/schema";
import { DoorOpen, Plus, Edit, Trash2, CheckCircle2, XCircle, Wrench } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";

const ROOM_TYPES: Record<string, { label: string; emoji: string }> = {
  room: { label: "Room", emoji: "🚪" },
  chair: { label: "Chair / Station", emoji: "💺" },
  station: { label: "Station", emoji: "🔧" },
  court: { label: "Court", emoji: "🏸" },
  lane: { label: "Lane", emoji: "🏊" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  available: { label: "Available", color: "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400", icon: CheckCircle2 },
  occupied: { label: "Occupied", color: "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400", icon: XCircle },
  maintenance: { label: "Maintenance", color: "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400", icon: Wrench },
};

const formSchema = insertServiceRoomSchema.extend({
  name: z.string().min(1, "Name is required"),
});

function RoomForm({ initial, onClose }: { initial?: ServiceRoom; onClose: () => void }) {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const isEdit = !!initial?.id;

  const subType = (settings as any)?.businessSubType ?? "";
  const defaultType = subType === "salon" ? "chair" : subType === "gym" ? "station" : "room";

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initial?.name ?? "",
      type: (initial?.type as any) ?? defaultType,
      status: (initial?.status as any) ?? "available",
      notes: initial?.notes ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (isEdit) {
        await apiRequest("PUT", `/api/service-rooms/${initial!.id}`, data);
      } else {
        await apiRequest("POST", "/api/service-rooms", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-rooms"] });
      toast({ title: isEdit ? "Room updated" : "Room added" });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to save", variant: "destructive" }),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl><Input data-testid="input-room-name" placeholder="e.g. Room 1, Chair A, Station 3" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="type" render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value ?? defaultType}>
                <FormControl><SelectTrigger data-testid="select-room-type"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.entries(ROOM_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value ?? "available"}>
                <FormControl><SelectTrigger data-testid="select-room-status"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl><Textarea data-testid="input-room-notes" placeholder="Any notes about this room…" rows={2} {...field} value={field.value ?? ""} /></FormControl>
          </FormItem>
        )} />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-save-room">
            {mutation.isPending ? "Saving…" : isEdit ? "Update" : "Add"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function RoomCard({ room, onEdit, onStatusChange, onDelete }: {
  room: ServiceRoom;
  onEdit: () => void;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const sc = STATUS_CONFIG[room.status ?? "available"] ?? STATUS_CONFIG.available;
  const rt = ROOM_TYPES[room.type ?? "room"] ?? ROOM_TYPES.room;
  const StatusIcon = sc.icon;

  return (
    <div data-testid={`card-room-${room.id}`} className={`border-2 rounded-2xl p-4 transition-all ${sc.color}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-background/60 border border-current/20 flex items-center justify-center text-2xl shrink-0">
            {rt.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-foreground text-base" data-testid={`text-room-name-${room.id}`}>{room.name}</p>
            </div>
            <p className="text-xs text-muted-foreground">{rt.label}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <StatusIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">{sc.label}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} data-testid={`button-edit-room-${room.id}`}><Edit className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} data-testid={`button-delete-room-${room.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {room.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{room.notes}"</p>}
      <div className="flex gap-1.5 mt-3 flex-wrap">
        {["available", "occupied", "maintenance"].map((s) => (
          s !== room.status && (
            <button key={s} onClick={() => onStatusChange(s)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-background/60 border border-current/20 hover:bg-background/80 font-medium transition-colors"
              data-testid={`button-room-status-${s}-${room.id}`}
            >
              → {STATUS_CONFIG[s]?.label}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

export default function RoomsPage() {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRoom | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<ServiceRoom | undefined>();

  const subType = (settings as any)?.businessSubType ?? "";
  const pageTitle = subType === "salon" ? "Chairs & Stations" : subType === "gym" ? "Stations & Courts" : "Rooms & Stations";
  const pageDesc = subType === "salon" ? "Manage styling chairs and workstations" : subType === "gym" ? "Manage courts, lanes, and equipment areas" : "Manage treatment rooms and service stations";

  const { data: rooms = [], isLoading } = useQuery<ServiceRoom[]>({ queryKey: ["/api/service-rooms"] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PUT", `/api/service-rooms/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/service-rooms"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/service-rooms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-rooms"] });
      toast({ title: "Removed" });
      setConfirmDelete(undefined);
    },
  });

  const available = (rooms as ServiceRoom[]).filter((r) => r.status === "available");
  const occupied = (rooms as ServiceRoom[]).filter((r) => r.status === "occupied");
  const maintenance = (rooms as ServiceRoom[]).filter((r) => r.status === "maintenance");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pageDesc}</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }} data-testid="button-add-room">
          <Plus className="h-4 w-4 mr-1.5" /> Add
        </Button>
      </div>

      {/* Summary chips */}
      {(rooms as ServiceRoom[]).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            ✓ {available.length} Available
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            ⏳ {occupied.length} Occupied
          </div>
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-semibold px-3 py-1.5 rounded-full">
            🔧 {maintenance.length} Maintenance
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1,2,3,4].map((i) => <div key={i} className="h-28 bg-muted/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : (rooms as ServiceRoom[]).length === 0 ? (
        <div className="text-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <DoorOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground">No rooms set up yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your rooms, chairs, or stations to track availability</p>
          <Button className="mt-4" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Room</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(rooms as ServiceRoom[]).map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onEdit={() => { setEditing(room); setDialogOpen(true); }}
              onStatusChange={(s) => statusMutation.mutate({ id: room.id, status: s })}
              onDelete={() => setConfirmDelete(room)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setEditing(undefined); setDialogOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-primary" />
              {editing ? "Edit Room" : "Add Room / Station"}
            </DialogTitle>
          </DialogHeader>
          <RoomForm initial={editing} onClose={() => { setEditing(undefined); setDialogOpen(false); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(undefined); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove Room?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Remove <strong>{confirmDelete?.name}</strong>? This cannot be undone.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(undefined)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(confirmDelete!.id)} data-testid="button-confirm-delete-room">
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
