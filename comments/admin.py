from django.contrib import admin
from .models import Comment, Notification, CommentRecipient

@admin.register(CommentRecipient)
class CommentRecipientAdmin(admin.ModelAdmin):
    list_display = ('comment', 'recipient_email')
    search_fields = ('recipient_email',)

class CommentRecipientInline(admin.TabularInline):
    model = CommentRecipient
    extra = 1
    raw_id_fields = ('comment',)

@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "parent",
        "page_url",
        "selected_text",
        "created_at",
        "unique_reply_id",
    )
    list_filter = ("created_at", "user", "page_url")
    search_fields = ("comment_text", "selected_text", "user__username")
    raw_id_fields = ("user", "parent")
    inlines = [CommentRecipientInline]

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "recipient", "comment", "is_read", "created_at")
    list_filter = ("is_read", "created_at", "recipient")
    search_fields = ("recipient__username", "comment__comment_text")
    raw_id_fields = ("recipient", "comment")