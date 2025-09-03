from django.db import models
from django.db import models
from django.contrib.auth.models import User
import uuid

# This model stores the private comment recipients
class CommentRecipient(models.Model):
    comment = models.ForeignKey('Comment', on_delete=models.CASCADE, related_name='recipients')
    recipient_email = models.EmailField()

    def __str__(self):
        return f"Comment {self.comment.id} to {self.recipient_email}"

class Comment(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    page_url = models.URLField()
    selected_text = models.TextField()
    comment_text = models.TextField()
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='replies')
    unique_reply_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Comment by {self.user.username} on {self.page_url}'

class Notification(models.Model):
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f'Notification for {self.recipient.username} on comment {self.comment.id}'