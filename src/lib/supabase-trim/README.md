# The Supabase clients this app does not use

`@supabase/supabase-js` is five clients in a trench coat: PostgREST, auth,
realtime, storage and edge functions. This app uses two of them. The other
three are constructed anyway — `SupabaseClient`'s constructor makes a
`RealtimeClient` and a `StorageClient` eagerly, so no bundler can prove they
are dead code — and they cost more than half of what a signed-out visitor
downloads.

The files here stand in for them. `vite-plugins/supabaseTrim.ts` maps the three
package names onto them at build time, in both this app's build and the
harness's.

Each stub constructs silently, because the real client constructs one whether
anyone asked for it or not, and throws the moment anything actually *uses* it,
naming the file to edit. A stub that quietly did nothing would turn "this build
has no realtime" into a subscription that never fires — a bug that looks like a
database problem and cannot be found from the console.

If this app ever needs live updates, file uploads or an edge function, delete
the alias for that one package and take the kilobytes back knowingly.
