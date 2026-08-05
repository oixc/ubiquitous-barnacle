# Public ntfy.sh topic as sync transport

Sync rides a public, unauthenticated ntfy.sh topic named after the List. We chose
this over running an authenticated backend to keep the product zero-cost and
zero-infrastructure (static hosting plus a free relay). Accepted consequence:
anyone who knows the List name can read and write it, so List names must be
unguessable, and the model deliberately has no membership or permission concept.
